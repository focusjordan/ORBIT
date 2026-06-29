module.exports = function({ types: t }) {
  const TYPE_SIZES = {
    'int8': 1, 'uint8': 1,
    'int16': 2, 'uint16': 2,
    'int32': 4, 'uint32': 4,
    'float32': 4, 'float64': 8
  };

  const TYPE_GETTERS = {
    'int8': 'getInt8', 'uint8': 'getUint8',
    'int16': 'getInt16', 'uint16': 'getUint16',
    'int32': 'getInt32', 'uint32': 'getUint32',
    'float32': 'getFloat32', 'float64': 'getFloat64'
  };

  const ARRAY_VIEWS = {
    'int8': 'Int8Array', 'uint8': 'Uint8Array',
    'int16': 'Int16Array', 'uint16': 'Uint16Array',
    'int32': 'Int32Array', 'uint32': 'Uint32Array',
    'float32': 'Float32Array', 'float64': 'Float64Array'
  };

  return {
    name: "babel-plugin-binary-layout",
    visitor: {
      ClassDeclaration(path) {
        const decorators = path.node.decorators || [];
        const hasBinaryLayout = decorators.some(
          d => t.isIdentifier(d.expression) && d.expression.name === 'binaryLayout'
        );

        if (!hasBinaryLayout) return;

        // 1. Remove the @binaryLayout class decorator
        path.node.decorators = decorators.filter(
          d => !(t.isIdentifier(d.expression) && d.expression.name === 'binaryLayout')
        );

        let currentOffset = 0;
        const getters = [];

        // 2. Traverse properties, compute offsets, and remove properties
        path.get('body').get('body').forEach(elementPath => {
          if (elementPath.isClassProperty()) {
            const propDecorators = elementPath.node.decorators || [];
            let typeName = null;
            let size = 1; // Default to 1 element

            for (const dec of propDecorators) {
              if (t.isCallExpression(dec.expression)) {
                const name = dec.expression.callee.name;
                const args = dec.expression.arguments;
                // Parse @type('float32')
                if (name === 'type' && args.length === 1 && t.isStringLiteral(args[0])) {
                  typeName = args[0].value;
                } 
                // Parse @size(128)
                else if (name === 'size' && args.length === 1 && t.isNumericLiteral(args[0])) {
                  size = args[0].value;
                }
              }
            }

            if (!typeName || !TYPE_SIZES[typeName]) {
              return; // Skip properties without valid @type mapping
            }

            const byteSize = TYPE_SIZES[typeName];
            const totalBytes = byteSize * size;
            const offset = currentOffset;
            currentOffset += totalBytes;

            const propName = elementPath.node.key;

            let getterBody;
            if (size === 1) {
              // Primitive AST: return this._view.getFloat32(offset, true);
              getterBody = t.returnStatement(
                t.callExpression(
                  t.memberExpression(
                    t.memberExpression(t.thisExpression(), t.identifier('_view')),
                    t.identifier(TYPE_GETTERS[typeName])
                  ),
                  [t.numericLiteral(offset), t.booleanLiteral(true)] // Little-endian
                )
              );
            } else {
              // Chunk Array AST: return new Float32Array(this._buffer.slice(offset, offset + totalBytes));
              // CRITICAL: .slice() copies the memory, allowing parent buffer GC!
              getterBody = t.returnStatement(
                t.newExpression(
                  t.identifier(ARRAY_VIEWS[typeName]),
                  [
                    t.callExpression(
                      t.memberExpression(
                        t.memberExpression(t.thisExpression(), t.identifier('_buffer')),
                        t.identifier('slice') 
                      ),
                      [t.numericLiteral(offset), t.numericLiteral(offset + totalBytes)]
                    )
                  ]
                )
              );
            }

            const getter = t.classMethod(
              "get",
              propName,
              [],
              t.blockStatement([getterBody])
            );

            getters.push(getter);
            
            // Remove the original property and its decorators
            elementPath.remove();
          }
        });

        // 3. Inject internal constructor
        // constructor(buffer) {
        //   this._buffer = buffer;
        //   this._view = new DataView(buffer);
        // }
        const constructor = t.classMethod(
          "constructor",
          t.identifier("constructor"),
          [t.identifier("buffer")],
          t.blockStatement([
            t.expressionStatement(
              t.assignmentExpression(
                "=",
                t.memberExpression(t.thisExpression(), t.identifier("_buffer")),
                t.identifier("buffer")
              )
            ),
            t.expressionStatement(
              t.assignmentExpression(
                "=",
                t.memberExpression(t.thisExpression(), t.identifier("_view")),
                t.newExpression(t.identifier("DataView"), [t.identifier("buffer")])
              )
            )
          ])
        );

        // 4. Inject Static Factory Method
        // static fromBuffer(buffer) {
        //   return new this(buffer);
        // }
        const staticFactory = t.classMethod(
          "method",
          t.identifier("fromBuffer"),
          [t.identifier("buffer")],
          t.blockStatement([
            t.returnStatement(
              t.newExpression(t.thisExpression(), [t.identifier("buffer")])
            )
          ]),
          false, // computed
          true  // static
        );

        // Prepend factory/constructor and append the new safe getters
        path.get('body').unshiftContainer('body', [staticFactory, constructor]);
        path.get('body').pushContainer('body', getters);
      }
    }
  };
};
