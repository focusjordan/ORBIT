module.exports = function (babel) {
  const { types: t, template } = babel;

  return {
    name: 'babel-plugin-cbor-aot',
    visitor: {
      ClassDeclaration(path) {
        // 1. Check for @cbor decorator
        const decorators = path.node.decorators;
        if (!decorators || decorators.length === 0) return;

        const cborDecoratorIndex = decorators.findIndex(
          (d) => t.isIdentifier(d.expression, { name: 'cbor' })
        );

        if (cborDecoratorIndex === -1) return;

        // 2. Strip the @cbor decorator
        decorators.splice(cborDecoratorIndex, 1);
        if (decorators.length === 0) {
          path.node.decorators = null;
        }

        // 3. Find and strip properties
        const properties = [];
        const nonProperties = [];

        for (const element of path.node.body.body) {
          if (t.isClassProperty(element)) {
            properties.push(element);
          } else {
            nonProperties.push(element);
          }
        }

        // Strip the class properties
        path.node.body.body = nonProperties;

        // 4. Calculate static layout & generate inline writes
        let offset = 0;
        const statements = [];

        // Assuming a CBOR Map representation for the object.
        // Map header: 0xa0 + number of properties (assuming <= 23 for phase 1 sprint)
        const mapHeader = 0xa0 + properties.length;
        statements.push(`buf[${offset++}] = ${mapHeader};`);

        for (const prop of properties) {
          // Identify the key name
          let keyName;
          if (t.isIdentifier(prop.key)) {
            keyName = prop.key.name;
          } else if (t.isStringLiteral(prop.key)) {
            keyName = prop.key.value;
          } else {
            continue; // Skip computed or non-standard keys for now
          }
          
          // Write string key (assuming length <= 23 for sprint)
          const keyLen = keyName.length;
          statements.push(`buf[${offset++}] = ${0x60 + keyLen};`);
          for (let i = 0; i < keyLen; i++) {
            statements.push(`buf[${offset++}] = ${keyName.charCodeAt(i)};`);
          }

          // Determine value type from TS annotation
          let isBoolean = false;
          let isNumber = false;

          const typeAnn = prop.typeAnnotation?.typeAnnotation;
          if (t.isTSBooleanKeyword(typeAnn) || (t.isTSTypeReference(typeAnn) && t.isIdentifier(typeAnn.typeName, { name: 'Boolean' }))) {
            isBoolean = true;
          } else if (t.isTSNumberKeyword(typeAnn) || (t.isTSTypeReference(typeAnn) && t.isIdentifier(typeAnn.typeName, { name: 'Number' }))) {
            isNumber = true;
          }

          if (isBoolean) {
            statements.push(`buf[${offset}] = this.${keyName} ? 0xf5 : 0xf4;`);
            offset += 1;
          } else if (isNumber) {
            // Encode as 32-bit integer (always using 5 bytes for AOT fixed layout to avoid branching byte-sizes)
            statements.push(`
              if (this.${keyName} >= 0) {
                buf[${offset}] = 0x1a;
                buf[${offset + 1}] = (this.${keyName} >>> 24) & 0xff;
                buf[${offset + 2}] = (this.${keyName} >>> 16) & 0xff;
                buf[${offset + 3}] = (this.${keyName} >>> 8) & 0xff;
                buf[${offset + 4}] = this.${keyName} & 0xff;
              } else {
                buf[${offset}] = 0x3a;
                const val_${keyName} = -this.${keyName} - 1;
                buf[${offset + 1}] = (val_${keyName} >>> 24) & 0xff;
                buf[${offset + 2}] = (val_${keyName} >>> 16) & 0xff;
                buf[${offset + 3}] = (val_${keyName} >>> 8) & 0xff;
                buf[${offset + 4}] = val_${keyName} & 0xff;
              }
            `);
            offset += 5;
          } else {
            statements.push(`// Unsupported type for property: ${keyName}`);
          }
        }

        // 5. Inject the compiled toCBOR() method
        const methodCode = `
          toCBOR() {
            const buf = new Uint8Array(${offset});
            ${statements.join('\n')}
            return buf;
          }
        `;
        
        // Build AST for the injected method
        let parsedMethod;
        try {
          // Attempt the cleaner classMethod parser first
          parsedMethod = template.classMethod(methodCode)();
        } catch (e) {
          // Fallback parsing via full class if template.classMethod is missing/fails
          const classCode = `class __TEMP { ${methodCode} }`;
          const classAst = template.statements(classCode)();
          parsedMethod = classAst[0].body.body[0];
        }

        path.node.body.body.push(parsedMethod);
      },
    },
  };
};
