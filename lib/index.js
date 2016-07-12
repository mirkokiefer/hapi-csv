'use strict';

// Load modules
const Joi = require('joi');
const Hoek = require('Hoek');
const internals = {};

internals.routeMap = new Map();

internals.maximumElementsArray;
internals.separator;

exports.register = (server, baseOptions, next) => {

    internals.maximumElementsArray = baseOptions.maximumElementsArray ? baseOptions.maximumElementsArray : 5;
    internals.separator = baseOptions.separator ? baseOptions.separator : ',';

    server.ext('onPreStart', (request, reply) => {

        server.connections.forEach((connection) => {

            connection.table().forEach((route) => {

                if (route.settings.response.schema) {
                    internals.routeMap.set(route.path, route.settings.response.schema);
                }
            });
        });

        return reply();
    });

    server.ext('onPreResponse', (request, reply) => {

        const acceptHeader = request.headers.accept;
        if (internals.routeMap.has(request.route.path) && acceptHeader.indexOf('text/csv') > -1) {
            const schema = internals.routeMap.get(request.route.path);
            return reply(internals.schemaToCsv(schema, request.response.source, internals.separator, internals.maximumElementsArray));
        }
        return reply.continue();
    });

    return next();

};

exports.register.attributes = {
    pkg: require('../package.json'),
    once: true
};

internals.schemaToCsv = function (schema, dataset, separator, maxElementsArray) {

    if (!(dataset instanceof Array) && !(dataset instanceof Object)) {
        return dataset;
    }

    return internals.headerQueryMapToCsv(internals.schemaToHeaders(schema), dataset, separator);
};

internals.schemaToHeaders = function (schema) {

    return internals.arrayToMap(internals.parseSchema(Joi.compile(schema).describe()));
};

internals.arrayToMap = function (array) {

    const resultMap = new Map();

    Hoek.flatten(array).map((item) => {

        if (Object.keys(item)[0] !== undefined) {
            const key = Object.keys(item)[0];
            const value = item[key];
            resultMap.set(key, value);
        }
        return resultMap;
    });

    return resultMap;
};

internals.parseSchema = function (joiSchema, keyName, arrayFlag) {

    if (joiSchema.type === 'object') {
        let children = [];

        if (joiSchema.children) {
            const childrenKeys = Object.keys(joiSchema.children);
            children = children.concat(childrenKeys.map((key) => internals.parseSchema(joiSchema.children[key], key)));

            if (!keyName) {
                return children;
            }

            children = Hoek.flatten(children);

            return children.map((child) => {

                const key = Object.keys(child)[0];
                child[key].unshift(keyName);

                if (!arrayFlag) {
                    const name = keyName + '.' + key;
                    child[name] = child[key];
                    delete child[key];
                }

                return child;
            });
        }
        return false;
    }

    if (joiSchema.type === 'array') {

        const item = joiSchema.items[0];

        const parsedData = internals.parseSchema(item, keyName, true);

        const prefixedDataArray = [];

        if (keyName && parsedData) {
            for (let i = 0; i < internals.maximumElementsArray; ++i) {

                prefixedDataArray.push(parsedData.map((res) => {

                    const keyEntry = Object.keys(res)[0];
                    const name = parsedData.length === 1 ? `${keyName}_${i}` : `${keyName}_${i}.${keyEntry}`;
                    const spliced = res[keyEntry].slice();
                    spliced.splice(1, 0, i);
                    return {
                        [name]: spliced
                    };
                }));
            }
            return prefixedDataArray;
        }
        return parsedData;
    }

    return [{ [keyName]: [keyName] }];
};

internals.headerQueryMapToCsv = function (headers, dataset, separator) {

    let csv = '';
    let row = '';
    let flag = false;

    for (const key of headers.keys()) {
        row += key + separator;
    }

    csv += row + '\n';
    row = '';

    if (!(dataset instanceof Array)) {
        dataset = [dataset];
    }

    for (let i = 0; i < dataset.length; ++i) {
        row = '';
        let temp = dataset[i];
        for (const properties of headers.values()) {
            for (const header of properties) {
                if (temp[header] === null || temp[header] === undefined) {
                    flag = true;
                    break;
                }
                else {
                    temp = temp[header];
                }
            }
            if (flag) {
                row += separator;
                flag = false;
            }
            else {

                row += '\"' + temp + '\"' + separator;
            }
            temp = dataset[i];
        }

        csv += row + '\n';
    }
    return csv.trim();
};