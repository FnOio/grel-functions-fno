const fs = require("fs");
const path = require("path");
const N3 = require("n3");
const csv = require("csvtojson");

const {DataFactory} = N3;
const {namedNode, literal, defaultGraph, quad} = DataFactory;

const prefixes = {
  fno: "https://w3id.org/function/ontology#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  dcterms: "http://purl.org/dc/terms/",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  grel: "http://semweb.mmlab.be/ns/grel#",
};

const paramsPath = path.resolve(__dirname, 'fns_params.csv');
const functionsPath = path.resolve(__dirname, 'fns_fns.csv');
const outsPath = path.resolve(__dirname, 'fns_outs.csv');
const outPath = path.resolve(__dirname, 'out.ttl');

const boolNode = node('xsd', 'boolean');

const nodes = {
  _false: literal('false', boolNode),
  _true: literal('true', boolNode),
  bool: boolNode,
  a: node('rdf', 'type'),
  any: node('xsd', 'any'),
  date: node('xsd', 'date'),
  datetime: node('xsd', 'dateTime'),
  decimal: node('xsd', 'decimal'),
  description: node('dcterms', 'description'),
  expects: node('fno', 'expects'),
  first: node('rdf', 'first'),
  fno: node('fno', 'Function'),
  label: node('rdfs', 'label'),
  list: node('rdf', 'List'),
  name: node('fno', 'name'),
  nil: node('rdf', 'nil'),
  output: node('fno', 'Output'),
  parameter: node('fno', 'Parameter'),
  predicate: node('fno', 'predicate'),
  required: node('fno', 'required'),
  returns: node('fno', 'returns'),
  rest: node('rdf', 'rest'),
  string: node('xsd', 'string'),
  type: node('fno', 'type'),
  xsd_int: node('xsd', 'int'),
};

const outStream = fs.createWriteStream(outPath);
const writer = N3.Writer(outStream, {prefixes});

createParams(paramsPath, writer, e => {
  createOuts(outsPath, writer, e => {
    createFunctions(functionsPath, writer, e => {
      writer.end((e, res) => {
        outStream.end((e, res) => {
          console.log("Done!");
        });
      });
    });
  });
});

const created = {};

function createParams(paramsPath, store, cb) {
  csv({delimiter: ","}).fromFile(paramsPath).then((jsonObj) => {
    /*
    grel:parameter_int_i_from a fno:Parameter ;
    fno:name "from" ;
    rdfs:label "from" ;
    fno:predicate grel:param_from ;
    fno:type xsd:int ;
    fno:required "true"^^xsd:boolean .
    */
    jsonObj.forEach(o => {
      if (!o.name || created[o.name]) {
        return;
      }
      const param = node('grel', `param_${o.name}`);
      store.addQuad(param, nodes.a, nodes.parameter);
      store.addQuad(param, nodes.name, literal(o['param name']));
      store.addQuad(param, nodes.label, literal(o['param name']));
      store.addQuad(param, nodes.predicate, node('grel', o.name));
      store.addQuad(param, nodes.type, toType(o['param type']));
      const req = o.req ? nodes._false : nodes._true;
      store.addQuad(param, nodes.required, req);
      created[o.name] = true;
    });
    return;
  }).then(() => {
    return cb();
  }).catch(e => {
    return cb(e);
  });
}

function createOuts(outsPath, store, cb) {
  csv({delimiter: ","}).fromFile(outsPath).then((jsonObj) => {
    /*
    grel:output_array a fno:Output;
    fno:predicate :out_array ;
    fno:type rdf:List .
    */
    jsonObj.forEach(o => {
      if (!o.typeOut || created[`output_${o.typeOut}`]) {
        return;
      }
      const param = node('grel', `output_${o.typeOut}`);
      store.addQuad(param, nodes.a, nodes.output);
      store.addQuad(param, nodes.predicate, node('grel', `out_${o.typeOut}`));
      store.addQuad(param, nodes.type, toType(o.typeOut));
      created[`output_${o.typeOut}`] = true;
    });
    return;
  }).then(() => {
    return cb();
  }).catch(e => {
    return cb(e);
  });
}

function createFunctions(functionsPath, store, cb) {
  csv({delimiter: ","}).fromFile(functionsPath).then((jsonObj) => {
    /*
    grel:array_get a fno:Function ;
    fno:name "get"^^xsd:string;
    dcterms:description "Get"^^xsd:string;
    fno:expects ( grel:parameter_array_a grel:parameter_int_i_from grel:parameter_int_i_opt_to );
    fno:returns ( grel:output_array ) .
    */
    jsonObj.forEach(o => {
      if (!o.slug) {
        return;
      }
      const fn = node('grel', `fn_${o.Type.toLowerCase()}_${o.slug}`);
      store.addQuad(fn, nodes.a, nodes.fno);
      store.addQuad(fn, nodes.name, literal(o.slug));
      store.addQuad(fn, nodes.description, literal(o.slug));
      let params = [];
      if (o.p1_uri) {
        params.push(node('grel', `param_${o.p1_uri}`));
      }
      if (o.p2_uri) {
        params.push(node('grel', o.p2_uri));
      }
      if (o.p3_uri) {
        params.push(node('grel', o.p3_uri));
      }
      if (o.p4_uri) {
        params.push(node('grel', o.p4_uri));
      }
      if (o.p5_uri) {
        params.push(node('grel', o.p5_uri));
      }
      if (o.p6_uri) {
        params.push(node('grel', o.p6_uri));
      }
      store.addQuad(fn, nodes.expects, writer.list(params));
      let returns = [];
      returns.push(node('grel', `output_${o.typeOut}`));
      store.addQuad(fn, nodes.returns, writer.list(returns));
    });
    return;
  }).then(() => {
    return cb();
  }).catch(e => {
    return cb(e);
  });
}

function addList(store, s, p, os) {
  if (os.length === 0) {
    return;
  }
  let currentNode = os.shift();
  let headNode = store.createBlankNode();
  store.addQuad(s, p, headNode);
  store.addQuad(headNode, nodes.first, currentNode);
  for (let i = 0; i < os.length; i++) {
    let nextNode = store.createBlankNode();
    store.addQuad(headNode, nodes.rest, nextNode);
    headNode = nextNode;
    store.addQuad(headNode, nodes.first, os[i]);
  }
  store.addQuad(headNode, nodes.rest, nodes.nil);
}

function toType(type) {
  switch (type) {
    case "any":
      return nodes.any;
    case "array":
      return nodes.list;
    case "bool":
      return nodes.bool;
    case "date":
      return nodes.date;
    case "datetime":
      return nodes.datetime;
    case "decimal":
      return nodes.decimal;
    case "int":
      return nodes.xsd_int;
    case "string":
      return nodes.string;
    default : {
      return nodes.string;
    }
  }
}

function node(prefix, name) {
  return namedNode(`${prefixes[prefix]}${name}`);
}
