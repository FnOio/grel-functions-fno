const fs = require("fs");
const path = require("path");
const N3 = require("n3");
const csv = require("csvtojson");
const GrelParser = require("./lib/grel-parser");
const SPARQLParser = require("./lib/sparql-parser");
const XPATHParser = require("./lib/xpath-parser");
const SQLParser = require("./lib/sql-parser");

const {DataFactory} = N3;
const {namedNode, literal, defaultGraph, quad} = DataFactory;

const prefixes = {
  dcterms: "http://purl.org/dc/terms/",
  fno: "https://w3id.org/function/ontology#",
  fnoi: "https://w3id.org/function/vocabulary/implementation#",
  fnom: "https://w3id.org/function/vocabulary/mapping#",
  fns: "https://fno.io/hub/data/resource/",
  grel: "http://semweb.mmlab.be/ns/grel#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

const paramsPath = path.resolve(__dirname, 'fns_params.csv');
const functionsPath = path.resolve(__dirname, 'fns_fns.csv');
const outsPath = path.resolve(__dirname, 'fns_outs.csv');
const alignmentPath = path.resolve(__dirname, 'fns_alignment.csv');
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
  problem: node('fno', 'Problem'),
  required: node('fno', 'required'),
  returns: node('fno', 'returns'),
  rest: node('rdf', 'rest'),
  skosBroader: node('skos', 'broader'),
  skosNarrower: node('skos', 'narrower'),
  solves: node('fno', 'solves'),
  string: node('xsd', 'string'),
  type: node('fno', 'type'),
  xsd_int: node('xsd', 'int'),
};

const created = {};

main().then(() => {
  console.log("Done!");
});

async function main() {
  const outStream = fs.createWriteStream(outPath);
  const writer = N3.Writer(outStream, {prefixes});
  // await createProblems(functionsPath, writer);
  // await createParams(paramsPath, writer);
  // await createOuts(outsPath, writer);
  // await createFunctions(functionsPath, writer);
  await createAlignment(alignmentPath, writer);

  return new Promise((resolve, reject) => {
    writer.end((e, res) => {
      outStream.end();
      resolve();
    });
  });
}

async function createAlignment(alignmentsPath, store) {
  const jsonObj = await csv({delimiter: ","}).fromFile(alignmentsPath);
  const problems = {};

  const GrelImplementation = node('fns', `Implementation/GREL`);
  store.addQuad(GrelImplementation, nodes.a, node('fno', 'Implementation'));
  store.addQuad(GrelImplementation, nodes.a, node('fnoi', 'DeclarativeImplementation'));
  store.addQuad(GrelImplementation, nodes.a, node('fnoi', 'OpenRefineImplementation'));

  const SPARQLImplementation = node('fns', `Implementation/SPARQL`);
  store.addQuad(SPARQLImplementation, nodes.a, node('fno', 'Implementation'));
  store.addQuad(SPARQLImplementation, nodes.a, node('fnoi', 'DeclarativeImplementation'));
  store.addQuad(SPARQLImplementation, nodes.a, node('fnoi', 'SPARQLImplementation'));

  const XPathImplementation = node('fns', `Implementation/XPATH`);
  store.addQuad(XPathImplementation, nodes.a, node('fno', 'Implementation'));
  store.addQuad(XPathImplementation, nodes.a, node('fnoi', 'DeclarativeImplementation'));
  store.addQuad(XPathImplementation, nodes.a, node('fnoi', 'XPATHImplementation'));

  const SQLImplementation = node('fns', `Implementation/SQL`);
  store.addQuad(SQLImplementation, nodes.a, node('fno', 'Implementation'));
  store.addQuad(SQLImplementation, nodes.a, node('fnoi', 'DeclarativeImplementation'));
  store.addQuad(SQLImplementation, nodes.a, node('fnoi', 'SQLImplementation'));

  jsonObj.forEach(o => {
    if (!o.function) {
      return;
    }
    const problem = node('fns', `Problem/${o.function}`);
    store.addQuad(problem, nodes.a, nodes.problem);
    store.addQuad(problem, nodes.name, literal(o.function));

    const fn = node('fns', `Function/${o.function}`);
    store.addQuad(fn, nodes.a, nodes.fno);
    store.addQuad(fn, nodes.name, literal(o.function));
    store.addQuad(fn, nodes.solves, problem);

    if (!(o.GREL && o.SPARQL && o.XPath && o.SQL)) {
      return;
    }

    const grelFn = node('fns', `Function/grel_${o.GREL}`);
    store.addQuad(grelFn, nodes.a, nodes.fno);
    store.addQuad(grelFn, nodes.solves, problem);
    store.addQuad(grelFn, nodes.skosBroader, fn);
    store.addQuad(grelFn, node('rdfs', 'seeAlso'), literal(o.GREL_iri));
    store.addQuad(grelFn, nodes.name, literal(o.GREL));
    try {
      const fnObj = GrelParser.parse(o.GREL_signature)[0];
      const mapping = node('fns', `Mapping/grel_${o.GREL}_${fnObj.function}`);
      store.addQuad(mapping, nodes.a, node('fno', 'Mapping'));
      store.addQuad(mapping, node('fno', 'function'), grelFn);
      store.addQuad(mapping, node('fno', 'implementation'), GrelImplementation);
      const parameters = [];
      fnObj.parameters.forEach((p, i) => {
        const paramMapping = node('fns', `ParameterMapping/grel_${o.GREL}_${p.type}_${p.argument}`);
        store.addQuad(mapping, node('fno', 'parameterMapping'), paramMapping);
        store.addQuad(paramMapping, nodes.a, node('fno', 'ParameterMapping'));
        store.addQuad(paramMapping, nodes.a, node('fnom', 'PositionParameterMapping'));
        store.addQuad(paramMapping, node('fnom', 'implementationParameterPosition'), literal(i));
        const param = node('fns', `Parameter/grel_${o.GREL}_${p.type}_${p.argument}`);
        store.addQuad(param, nodes.a, node('fno', 'Parameter'));
        store.addQuad(param, node('fno', 'predicate'), node('fns', `Predicate/grel_${p.argument}`));
        // TODO type
        parameters.push(param);
        store.addQuad(paramMapping, node('fnom', 'functionParameter'), param);
        // TODO required
      });
      store.addQuad(grelFn, nodes.expects, store.list(parameters));
      const methodMapping = node('fns', `MethodMapping/grel_${fnObj.function}`);
      store.addQuad(methodMapping, nodes.a, node('fno', 'MethodMapping'));
      store.addQuad(methodMapping, nodes.a, node('fnom', 'StringMethodMapping'));
      store.addQuad(methodMapping, node('fnom', 'method-name'), literal(fnObj.function));
      store.addQuad(mapping, node('fno', 'methodMapping'), methodMapping);
      const output = node('fns', `Output/grel_${fnObj.function}`);
      store.addQuad(output, nodes.a, node('fno', 'Output'));
      const outputs = [];
      outputs.push(output);
      store.addQuad(grelFn, nodes.returns, store.list(outputs));
      const returnMapping = node('fns', `ReturnMapping/grel_${fnObj.function}`);
      store.addQuad(returnMapping, nodes.a, node('fno', 'ReturnMapping'));
      store.addQuad(returnMapping, nodes.a, node('fnom', 'DefaultReturnMapping'));
      store.addQuad(returnMapping, node('fnom', 'functionOutput'), output);
    } catch (e) {
      console.log('GREL ' + o.GREL_signature);
      // console.log(e);
    }
    store.addQuad(grelFn, nodes.description, literal(o.GREL_description));
    // TODO categories

    const sparqlFn = node('fns', `Function/sparql_${o.SPARQL}`);
    store.addQuad(sparqlFn, nodes.a, nodes.fno);
    store.addQuad(sparqlFn, nodes.solves, problem);
    store.addQuad(sparqlFn, nodes.skosBroader, fn);
    store.addQuad(sparqlFn, node('rdfs', 'seeAlso'), literal(o.SPARQL_iri));
    store.addQuad(sparqlFn, nodes.name, literal(o.SPARQL));
    try {
      const fnObj = SPARQLParser.parse(o.SPARQL_signature)[0];
      const mapping = node('fns', `Mapping/sparql_${o.SPARQL}_${fnObj.function}`);
      store.addQuad(mapping, nodes.a, node('fno', 'Mapping'));
      store.addQuad(mapping, node('fno', 'function'), sparqlFn);
      store.addQuad(mapping, node('fno', 'implementation'), SPARQLImplementation);
      const parameters = [];
      fnObj.parameters.forEach((p, i) => {
        const paramMapping = node('fns', `ParameterMapping/sparql_${o.SPARQL}_${p.type}_${p.argument}`);
        store.addQuad(mapping, node('fno', 'parameterMapping'), paramMapping);
        store.addQuad(paramMapping, nodes.a, node('fno', 'ParameterMapping'));
        store.addQuad(paramMapping, nodes.a, node('fnom', 'PositionParameterMapping'));
        store.addQuad(paramMapping, node('fnom', 'implementationParameterPosition'), literal(i));
        const param = node('fns', `Parameter/sparql_${o.SPARQL}_${p.type}_${p.argument}`);
        store.addQuad(param, nodes.a, node('fno', 'Parameter'));
        store.addQuad(param, node('fno', 'predicate'), node('fns', `Predicate/sparql_${p.argument}`));
        // TODO type
        parameters.push(param);
        store.addQuad(paramMapping, node('fnom', 'functionParameter'), param);
        // TODO required
      });
      store.addQuad(grelFn, nodes.expects, store.list(parameters));
      const methodMapping = node('fns', `MethodMapping/sparql_${fnObj.function}`);
      store.addQuad(methodMapping, nodes.a, node('fno', 'MethodMapping'));
      store.addQuad(methodMapping, nodes.a, node('fnom', 'StringMethodMapping'));
      store.addQuad(methodMapping, node('fnom', 'method-name'), literal(fnObj.function));
      store.addQuad(mapping, node('fno', 'methodMapping'), methodMapping);
      const output = node('fns', `Output/sparql_${fnObj.function}`);
      store.addQuad(output, nodes.a, node('fno', 'Output'));
      const outputs = [];
      outputs.push(output);
      store.addQuad(grelFn, nodes.returns, store.list(outputs));
      const returnMapping = node('fns', `ReturnMapping/sparql_${fnObj.function}`);
      store.addQuad(returnMapping, nodes.a, node('fno', 'ReturnMapping'));
      store.addQuad(returnMapping, nodes.a, node('fnom', 'DefaultReturnMapping'));
      store.addQuad(returnMapping, node('fnom', 'functionOutput'), output);
    } catch (e) {
      console.log('SPARQL ' + o.SPARQL_signature);
      // console.log(e);
    }
    store.addQuad(sparqlFn, nodes.description, literal(o.SPARQL_description));
    // TODO categories

    const xpathFn = node('fns', `Function/xpath_${o.XPath.slice(3)}`);
    store.addQuad(xpathFn, nodes.a, nodes.fno);
    store.addQuad(xpathFn, nodes.solves, problem);
    store.addQuad(xpathFn, nodes.skosBroader, fn);
    store.addQuad(xpathFn, node('rdfs', 'seeAlso'), literal(o.XPath_iri));
    store.addQuad(xpathFn, nodes.name, literal(o.XPath.slice(3)));
    try {
      const fnObj = XPATHParser.parse(o.Xpath_signature)[0];
      const mapping = node('fns', `Mapping/xpath_${o.XPath}_${fnObj.function}`);
      store.addQuad(mapping, nodes.a, node('fno', 'Mapping'));
      store.addQuad(mapping, node('fno', 'function'), xpathFn);
      store.addQuad(mapping, node('fno', 'implementation'), XPathImplementation);
      const parameters = [];
      fnObj.parameters.forEach((p, i) => {
        const paramMapping = node('fns', `ParameterMapping/xpath_${o.XPath}_${p.type}_${p.argument}`);
        store.addQuad(mapping, node('fno', 'parameterMapping'), paramMapping);
        store.addQuad(paramMapping, nodes.a, node('fno', 'ParameterMapping'));
        store.addQuad(paramMapping, nodes.a, node('fnom', 'PositionParameterMapping'));
        store.addQuad(paramMapping, node('fnom', 'implementationParameterPosition'), literal(i));
        const param = node('fns', `Parameter/xpath_${o.XPATH}_${p.type}_${p.argument}`);
        store.addQuad(param, nodes.a, node('fno', 'Parameter'));
        store.addQuad(param, node('fno', 'predicate'), node('fns', `Predicate/xpath_${p.argument}`));
        // TODO type
        parameters.push(param);
        store.addQuad(paramMapping, node('fnom', 'functionParameter'), param);
        // TODO required
      });
      store.addQuad(xpathFn, nodes.expects, store.list(parameters));
      const methodMapping = node('fns', `MethodMapping/xpath_${fnObj.function}`);
      store.addQuad(methodMapping, nodes.a, node('fno', 'MethodMapping'));
      store.addQuad(methodMapping, nodes.a, node('fnom', 'StringMethodMapping'));
      store.addQuad(methodMapping, node('fnom', 'method-name'), literal(fnObj.function));
      store.addQuad(mapping, node('fno', 'methodMapping'), methodMapping);
      const output = node('fns', `Output/xpath_${fnObj.function}`);
      store.addQuad(output, nodes.a, node('fno', 'Output'));
      const outputs = [];
      outputs.push(output);
      store.addQuad(xpathFn, nodes.returns, store.list(outputs));
      const returnMapping = node('fns', `ReturnMapping/xpath_${fnObj.function}`);
      store.addQuad(returnMapping, nodes.a, node('fno', 'ReturnMapping'));
      store.addQuad(returnMapping, nodes.a, node('fnom', 'DefaultReturnMapping'));
      store.addQuad(returnMapping, node('fnom', 'functionOutput'), output);
    } catch (e) {
      console.log('XPATH ' + o.Xpath_signature);
      // console.log(e);
    }
    store.addQuad(xpathFn, nodes.description, literal(o.Xpath_description));
    // TODO categories

    if (o.SQL.split(' or ').length > 1) {
      o.SQL.split(' or ').forEach(s => {
        const sqlFn = node('fns', `Function/sql_${s}`);
      });
    }
    const sqlName = o.SQL.split(' or ')[0].toLowerCase();
    const sqlFn = node('fns', `Function/sql_${sqlName}`);
    store.addQuad(sqlFn, nodes.a, nodes.fno);
    store.addQuad(sqlFn, nodes.solves, problem);
    store.addQuad(sqlFn, nodes.skosBroader, fn);
    if (o.SQL.split(' or ').length > 1) {
      o.SQL.split(' or ').forEach(s => {
        store.addQuad(sqlFn, nodes.name, literal(s));
      });
    } else {
      store.addQuad(sqlFn, nodes.name, literal(o.SQL));
    }
    try {
      const fnObj = SQLParser.parse(o.SQL_signature)[0];
      const mapping = node('fns', `Mapping/sql_${o.SQL}_${fnObj.function}`);
      store.addQuad(mapping, nodes.a, node('fno', 'Mapping'));
      store.addQuad(mapping, node('fno', 'function'), sqlFn);
      store.addQuad(mapping, node('fno', 'implementation'), SQLImplementation);
      const parameters = [];
      fnObj.parameters.forEach((p, i) => {
        const paramMapping = node('fns', `ParameterMapping/sql_${o.SQL}_${p.type}_${p.argument}`);
        store.addQuad(mapping, node('fno', 'parameterMapping'), paramMapping);
        store.addQuad(paramMapping, nodes.a, node('fno', 'ParameterMapping'));
        store.addQuad(paramMapping, nodes.a, node('fnom', 'PositionParameterMapping'));
        store.addQuad(paramMapping, node('fnom', 'implementationParameterPosition'), literal(i));
        const param = node('fns', `Parameter/sql_${o.SQL}_${p.type}_${p.argument}`);
        store.addQuad(param, nodes.a, node('fno', 'Parameter'));
        store.addQuad(param, node('fno', 'predicate'), node('fns', `Predicate/sql_${p.argument}`));
        // TODO type
        parameters.push(param);
        store.addQuad(paramMapping, node('fnom', 'functionParameter'), param);
        // TODO required
      });
      store.addQuad(sqlFn, nodes.expects, store.list(parameters));
      const methodMapping = node('fns', `MethodMapping/sql_${fnObj.function}`);
      store.addQuad(methodMapping, nodes.a, node('fno', 'MethodMapping'));
      store.addQuad(methodMapping, nodes.a, node('fnom', 'StringMethodMapping'));
      store.addQuad(methodMapping, node('fnom', 'method-name'), literal(fnObj.function));
      store.addQuad(mapping, node('fno', 'methodMapping'), methodMapping);
      const output = node('fns', `Output/sql_${fnObj.function}`);
      store.addQuad(output, nodes.a, node('fno', 'Output'));
      const outputs = [];
      outputs.push(output);
      store.addQuad(sqlFn, nodes.returns, store.list(outputs));
      const returnMapping = node('fns', `ReturnMapping/sql_${fnObj.function}`);
      store.addQuad(returnMapping, nodes.a, node('fno', 'ReturnMapping'));
      store.addQuad(returnMapping, nodes.a, node('fnom', 'DefaultReturnMapping'));
      store.addQuad(returnMapping, node('fnom', 'functionOutput'), output);
    } catch (e) {
      console.log('SQL ' + o.SQL_signature);
      // console.log(e);
    }
    store.addQuad(sqlFn, nodes.description, literal(o.SQL_description));
    // TODO categories
  });
}

async function createProblems(functionsPath, store) {
  const problems = {};
  const jsonObj = await csv({delimiter: ","}).fromFile(functionsPath);

  /*
  grel:prob_date a fno:Problem ;
  fno:name "The date problem"^^xsd:string ;
  dcterms:description ""^^xsd:string .
  */
  jsonObj.forEach(o => {
    if (!o.Type) {
      return;
    }
    let typeProblem = null;
    if (!problems[o.Type]) {
      typeProblem = node('grel', `problem_${o.Type.toLowerCase()}`);
      problems[o.Type] = typeProblem;

      store.addQuad(typeProblem, nodes.a, nodes.problem);
      store.addQuad(typeProblem, nodes.name, literal(`The ${o.Type.toLowerCase()} problem`));
    } else {
      typeProblem = problems[o.Type];
    }
    if (!o.slug) {
      return;
    }
    if (!problems[`${o.Type}_${o.slug}`]) {
      let specificProblem = node('grel', `problem_${o.Type.toLowerCase()}_${o.slug}`);
      problems[`${o.Type}_${o.slug}`] = specificProblem;

      store.addQuad(specificProblem, nodes.a, nodes.problem);
      store.addQuad(specificProblem, nodes.name, literal(`The ${o.Type.toLowerCase()} ${o.slug} problem`));
      store.addQuad(typeProblem, nodes.skosNarrower, specificProblem);
      store.addQuad(specificProblem, nodes.skosBroader, typeProblem);
    }
  });
}

async function createParams(paramsPath, store) {
  const jsonObj = await csv({delimiter: ","}).fromFile(paramsPath);
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
}

async function createOuts(outsPath, store, cb) {
  const jsonObj = await csv({delimiter: ","}).fromFile(outsPath);
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
}

async function createFunctions(functionsPath, store, cb) {
  const jsonObj = await csv({delimiter: ","}).fromFile(functionsPath);
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
    store.addQuad(fn, nodes.expects, store.list(params));
    let returns = [];
    returns.push(node('grel', `output_${o.typeOut}`));
    store.addQuad(fn, nodes.returns, store.list(returns));
  });
  return;
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
