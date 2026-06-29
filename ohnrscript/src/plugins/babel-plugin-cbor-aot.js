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

        // 4. Generate runtime size calculation and serialization code
        const sizeStatements = [];
        const writeStatements = [];

        // Base size logic
        sizeStatements.push(`let _size = 0;`);
        writeStatements.push(`let _offset = 0;`);

        // Assuming a CBOR Map representation for the object.
        // Map header: 0xa0 + number of properties (assuming <= 23 for phase 1 sprint)
        const mapHeader = 0xa0 + properties.length;
        sizeStatements.push(`_size += 1; // Map header`);
        writeStatements.push(`buf[_offset++] = ${mapHeader};`);

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
          sizeStatements.push(`_size += ${1 + keyLen}; // Key: ${keyName}`);
          
          writeStatements.push(`buf[_offset++] = ${0x60 + keyLen};`);
          for (let i = 0; i < keyLen; i++) {
            writeStatements.push(`buf[_offset++] = ${keyName.charCodeAt(i)};`);
          }

          // Determine value type from TS annotation
          let isBoolean = false;
          let isNumber = false;
          let isString = false;
          let isArray = false;

          const typeAnn = prop.typeAnnotation?.typeAnnotation;
          if (t.isTSBooleanKeyword(typeAnn) || (t.isTSTypeReference(typeAnn) && t.isIdentifier(typeAnn.typeName, { name: 'Boolean' }))) {
            isBoolean = true;
          } else if (t.isTSNumberKeyword(typeAnn) || (t.isTSTypeReference(typeAnn) && t.isIdentifier(typeAnn.typeName, { name: 'Number' }))) {
            isNumber = true;
          } else if (t.isTSStringKeyword(typeAnn) || (t.isTSTypeReference(typeAnn) && t.isIdentifier(typeAnn.typeName, { name: 'String' }))) {
            isString = true;
          } else if (t.isTSArrayType(typeAnn) || (t.isTSTypeReference(typeAnn) && t.isIdentifier(typeAnn.typeName, { name: 'Array' }))) {
            isArray = true;
          }

          if (isBoolean) {
            sizeStatements.push(`_size += 1;`);
            writeStatements.push(`buf[_offset++] = this.${keyName} ? 0xf5 : 0xf4;`);
          } else if (isNumber) {
            // Encode as 32-bit integer (always using 5 bytes for AOT fixed layout to avoid branching byte-sizes)
            sizeStatements.push(`_size += 5;`);
            writeStatements.push(`
              if (this.${keyName} >= 0) {
                buf[_offset++] = 0x1a;
                buf[_offset++] = (this.${keyName} >>> 24) & 0xff;
                buf[_offset++] = (this.${keyName} >>> 16) & 0xff;
                buf[_offset++] = (this.${keyName} >>> 8) & 0xff;
                buf[_offset++] = this.${keyName} & 0xff;
              } else {
                buf[_offset++] = 0x3a;
                const val_${keyName} = -this.${keyName} - 1;
                buf[_offset++] = (val_${keyName} >>> 24) & 0xff;
                buf[_offset++] = (val_${keyName} >>> 16) & 0xff;
                buf[_offset++] = (val_${keyName} >>> 8) & 0xff;
                buf[_offset++] = val_${keyName} & 0xff;
              }
            `);
          } else if (isString) {
            sizeStatements.push(`
              const len_${keyName} = this.${keyName}.length;
              if (len_${keyName} < 24) { _size += 1 + len_${keyName}; }
              else if (len_${keyName} <= 0xff) { _size += 2 + len_${keyName}; }
              else if (len_${keyName} <= 0xffff) { _size += 3 + len_${keyName}; }
              else { _size += 5 + len_${keyName}; }
            `);
            writeStatements.push(`
              if (len_${keyName} < 24) { buf[_offset++] = 0x60 + len_${keyName}; }
              else if (len_${keyName} <= 0xff) { buf[_offset++] = 0x78; buf[_offset++] = len_${keyName}; }
              else if (len_${keyName} <= 0xffff) { buf[_offset++] = 0x79; buf[_offset++] = (len_${keyName} >>> 8) & 0xff; buf[_offset++] = len_${keyName} & 0xff; }
              else { buf[_offset++] = 0x7a; buf[_offset++] = (len_${keyName} >>> 24) & 0xff; buf[_offset++] = (len_${keyName} >>> 16) & 0xff; buf[_offset++] = (len_${keyName} >>> 8) & 0xff; buf[_offset++] = len_${keyName} & 0xff; }
              for (let _i = 0; _i < len_${keyName}; _i++) {
                buf[_offset++] = this.${keyName}.charCodeAt(_i);
              }
            `);
          } else if (isArray) {
            sizeStatements.push(`
              const arrLen_${keyName} = this.${keyName}.length;
              if (arrLen_${keyName} < 24) { _size += 1; }
              else if (arrLen_${keyName} <= 0xff) { _size += 2; }
              else if (arrLen_${keyName} <= 0xffff) { _size += 3; }
              else { _size += 5; }
              // Assume Array of Numbers (32-bit fixed 5 bytes each)
              _size += arrLen_${keyName} * 5;
            `);
            writeStatements.push(`
              if (arrLen_${keyName} < 24) { buf[_offset++] = 0x80 + arrLen_${keyName}; }
              else if (arrLen_${keyName} <= 0xff) { buf[_offset++] = 0x98; buf[_offset++] = arrLen_${keyName}; }
              else if (arrLen_${keyName} <= 0xffff) { buf[_offset++] = 0x99; buf[_offset++] = (arrLen_${keyName} >>> 8) & 0xff; buf[_offset++] = arrLen_${keyName} & 0xff; }
              else { buf[_offset++] = 0x9a; buf[_offset++] = (arrLen_${keyName} >>> 24) & 0xff; buf[_offset++] = (arrLen_${keyName} >>> 16) & 0xff; buf[_offset++] = (arrLen_${keyName} >>> 8) & 0xff; buf[_offset++] = arrLen_${keyName} & 0xff; }
              for (let _i = 0; _i < arrLen_${keyName}; _i++) {
                const elem = this.${keyName}[_i];
                if (elem >= 0) {
                  buf[_offset++] = 0x1a;
                  buf[_offset++] = (elem >>> 24) & 0xff;
                  buf[_offset++] = (elem >>> 16) & 0xff;
                  buf[_offset++] = (elem >>> 8) & 0xff;
                  buf[_offset++] = elem & 0xff;
                } else {
                  buf[_offset++] = 0x3a;
                  const val_elem = -elem - 1;
                  buf[_offset++] = (val_elem >>> 24) & 0xff;
                  buf[_offset++] = (val_elem >>> 16) & 0xff;
                  buf[_offset++] = (val_elem >>> 8) & 0xff;
                  buf[_offset++] = val_elem & 0xff;
                }
              }
            `);
          } else {
            writeStatements.push(`// Unsupported type for property: ${keyName}`);
          }
        }

        // 5. Inject the compiled toCBOR() method
        const methodCode = `
          toCBOR() {
            ${sizeStatements.join('\n')}
            const buf = new Uint8Array(_size);
            ${writeStatements.join('\n')}
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
