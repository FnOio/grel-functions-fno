const fs = require("fs");
const path = require("path");
const {PassThrough} = require('stream');

const N3 = require("n3");
const csv = require("csvtojson");
const ttl_read = require('@graphy/content.ttl.read');
const ttl_write = require('@graphy/content.ttl.write');
const dataset = require('@graphy/memory.dataset.fast');

const GrelParser = require("../lib/grel-parser");
const SPARQLParser = require("../lib/sparql-parser");
const XPATHParser = require("../lib/xpath-parser");
const SQLParser = require("../lib/sql-parser");

const {DataFactory} = N3;
const {namedNode, literal} = DataFactory;

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

const paramsPath = path.resolve(__dirname, '../../resources/alignment/input/fns_params.csv');
const functionsPath = path.resolve(__dirname, '../../resources/alignment/input/fns_fns.csv');
const outsPath = path.resolve(__dirname, '../../resources/alignment/input/fns_outs.csv');
const alignmentPath = path.resolve(__dirname, '../../resources/alignment/input/fns_alignment.csv');
const outPath = path.resolve(__dirname, '../../resources/alignment/output/out.ttl');

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
  const outStreamPretty = fs.createWriteStream(outPath + "_p.ttl");
  const pipeStream = new PassThrough();
  const writer = new N3.Writer(pipeStream, {prefixes});
  // await createProblems(functionsPath, writer);
  // await createParams(paramsPath, writer);
  // await createOuts(outsPath, writer);
  // await createFunctions(functionsPath, writer);
  const jsonObj = await csv({delimiter: ","}).fromFile(alignmentPath);
  createAlignment(jsonObj, writer);
  writer.end();

  return new Promise((resolve, reject) => {
    pipeStream.pipe(outStream);
    pipeStream.pipe(ttl_read())
      .pipe(dataset())
      .pipe(ttl_write())
      .pipe(outStreamPretty).on('end', () => {
      resolve();
    });
  });
}

function createAlignment(jsonObj, store) {
  const problems = {};

  const GrelImplementation = node('fns', `Implementation/GREL`);
  store.addQuad(GrelImplementation, nodes.a, node('fno', 'Implementation'));
  store.addQuad(GrelImplementation, nodes.a, node('fnoi', 'DeclarativeImplementation'));
  store.addQuad(GrelImplementation, nodes.a, node('fnoi', 'OpenRefineImplementation'));
  store.addQuad(GrelImplementation, nodes.label, literal('GREL Implementation (OpenRefine)'));

  const SPARQLImplementation = node('fns', `Implementation/SPARQL`);
  store.addQuad(SPARQLImplementation, nodes.a, node('fno', 'Implementation'));
  store.addQuad(SPARQLImplementation, nodes.a, node('fnoi', 'DeclarativeImplementation'));
  store.addQuad(SPARQLImplementation, nodes.a, node('fnoi', 'SPARQLImplementation'));
  store.addQuad(SPARQLImplementation, nodes.label, literal('SPARQL Implementation'));

  const XPathImplementation = node('fns', `Implementation/XPATH`);
  store.addQuad(XPathImplementation, nodes.a, node('fno', 'Implementation'));
  store.addQuad(XPathImplementation, nodes.a, node('fnoi', 'DeclarativeImplementation'));
  store.addQuad(XPathImplementation, nodes.a, node('fnoi', 'XPATHImplementation'));
  store.addQuad(XPathImplementation, nodes.label, literal('XPath Implementation'));

  const SQLImplementation = node('fns', `Implementation/SQL`);
  store.addQuad(SQLImplementation, nodes.a, node('fno', 'Implementation'));
  store.addQuad(SQLImplementation, nodes.a, node('fnoi', 'DeclarativeImplementation'));
  store.addQuad(SQLImplementation, nodes.a, node('fnoi', 'SQLImplementation'));
  store.addQuad(SQLImplementation, nodes.label, literal('SQL Implementation'));

  jsonObj.forEach(o => {
    if (!o.function) {
      return;
    }

    const problem = node('fns', `Problem/${o.function}`);
    store.addQuad(problem, nodes.a, nodes.problem);
    store.addQuad(problem, nodes.name, literal(o.function));

    const broadFn = node('fns', `Function/${o.function}`);
    store.addQuad(broadFn, nodes.a, nodes.fno);
    store.addQuad(broadFn, nodes.name, literal(o.function));
    store.addQuad(broadFn, nodes.solves, problem);

    if (!(o.GREL && o.SPARQL && o.XPath && o.SQL)) {
      // return;
    }

    doGrel(o, store, problem, broadFn, GrelImplementation);
    doSparql(o, store, problem, broadFn, SPARQLImplementation);
    doXpath(o, store, problem, broadFn, XPathImplementation);
    doSql(o, store, problem, broadFn, SQLImplementation);
  });
}

// TODO ARRAY?

function doGrel(o, store, problem, fn, implementation) {
  // const fn = node('fns', `Function/${o.function}`);
  // store.addQuad(fn, nodes.a, nodes.fno);
  // store.addQuad(fn, nodes.solves, problem);
  // store.addQuad(fn, nodes.skosBroader, fn);
  store.addQuad(fn, nodes.name, literal(o.GREL));
  if (o.GREL_signature) {
    try {
      const fnObj = GrelParser.parse(o.GREL_signature)[0];
      const mapping = node('fns', `Mapping/grel_${o.GREL}_${fnObj.function}`);
      store.addQuad(mapping, nodes.a, node('fno', 'Mapping'));
      store.addQuad(mapping, node('fno', 'function'), fn);
      store.addQuad(mapping, node('fno', 'implementation'), implementation);
      store.addQuad(mapping, node('rdfs', 'seeAlso'), literal(o.GREL_iri));
      const parameters = [];
      fnObj.parameters.forEach((p, i) => {
        const paramMapping = node('fns', `ParameterMapping/grel_${o.GREL}_${p.type}_${encodeURIComponent(p.argument)}`);
        store.addQuad(mapping, node('fno', 'parameterMapping'), paramMapping);
        store.addQuad(paramMapping, nodes.a, node('fno', 'ParameterMapping'));
        store.addQuad(paramMapping, nodes.a, node('fnom', 'PositionParameterMapping'));
        store.addQuad(paramMapping, node('fnom', 'implementationParameterPosition'), literal(i));
        const param = node('fns', `Parameter/${p.type}_${encodeURIComponent(p.argument)}`);
        store.addQuad(param, nodes.a, node('fno', 'Parameter'));
        store.addQuad(param, node('fno', 'predicate'), node('fns', `Predicate/${p.type}_${encodeURIComponent(p.argument)}`));
        store.addQuad(param, node('fno', 'type'), typeToRealType(p.type));
        store.addQuad(param, node('rdfs', 'label'), literal(p.argument));
        parameters.push(param);
        store.addQuad(paramMapping, node('fnom', 'functionParameter'), param);
        if (p.required === true) {
          store.addQuad(param, node('fno', 'required'), literal(true));
        }
        if (p.required === false) {
          store.addQuad(param, node('fno', 'required'), literal(false));
        }
      });
      store.addQuad(fn, nodes.expects, store.list(parameters));
      const methodMapping = node('fns', `MethodMapping/grel_${fnObj.function}`);
      store.addQuad(methodMapping, nodes.a, node('fno', 'MethodMapping'));
      store.addQuad(methodMapping, nodes.a, node('fnom', 'StringMethodMapping'));
      store.addQuad(methodMapping, node('fnom', 'method-name'), literal(fnObj.function));
      store.addQuad(mapping, node('fno', 'methodMapping'), methodMapping);
      const output = node('fns', `Output/${fnObj.function}`);
      store.addQuad(output, nodes.a, node('fno', 'Output'));
      // TODO no outputType ?
      store.addQuad(output, nodes.predicate, node('fns', `Predicate/out`));
      const outputs = [];
      outputs.push(output);
      store.addQuad(fn, nodes.returns, store.list(outputs));
      const returnMapping = node('fns', `ReturnMapping/grel_${fnObj.function}`);
      store.addQuad(returnMapping, nodes.a, node('fno', 'ReturnMapping'));
      store.addQuad(returnMapping, nodes.a, node('fnom', 'DefaultReturnMapping'));
      store.addQuad(returnMapping, node('fnom', 'functionOutput'), output);
    } catch (e) {
      console.log('GREL ' + o.GREL_signature);
      // console.log(e);
    }
  }
  store.addQuad(fn, nodes.description, literal(o.GREL_description));
  // TODO categories
}

function doSparql(o, store, problem, fn, implementation) {
  // const fn = node('fns', `Function/sparql_${o.SPARQL}`);
  // store.addQuad(fn, nodes.a, nodes.fno);
  // store.addQuad(fn, nodes.solves, problem);
  // store.addQuad(fn, nodes.skosBroader, fn);
  store.addQuad(fn, nodes.name, literal(o.SPARQL));
  if (o.SPARQL_signature) {
    let fns = [];
    try {
      fns = SPARQLParser.parse(o.SPARQL_signature);
    } catch (e) {
      console.log('SPARQL ' + o.SPARQL_signature);
      // console.log(e);
    }
    fns.forEach((fnObj, index) => {
      const mapping = node('fns', `Mapping/sparql_${o.SPARQL}_${fnObj.function}_${index}`);
      store.addQuad(mapping, nodes.a, node('fno', 'Mapping'));
      store.addQuad(mapping, node('fno', 'function'), fn);
      store.addQuad(mapping, node('fno', 'implementation'), implementation);
      store.addQuad(mapping, node('rdfs', 'seeAlso'), literal(o.SPARQL_iri));
      const parameters = [];
      fnObj.parameters.forEach((p, i) => {
        const paramMapping = node('fns', `ParameterMapping/sparql_${o.SPARQL}_${p.type}_${p.argument}`);
        store.addQuad(mapping, node('fno', 'parameterMapping'), paramMapping);
        store.addQuad(paramMapping, nodes.a, node('fno', 'ParameterMapping'));
        store.addQuad(paramMapping, nodes.a, node('fnom', 'PositionParameterMapping'));
        store.addQuad(paramMapping, node('fnom', 'implementationParameterPosition'), literal(i));
        if (p.array) {
          store.addQuad(paramMapping, node('fnom', 'repeatableParameter'), literal(true));
        }
        const param = node('fns', `Parameter/${p.type}_${p.argument}`);
        store.addQuad(param, nodes.a, node('fno', 'Parameter'));
        store.addQuad(param, node('fno', 'predicate'), node('fns', `Predicate/${p.type}_${p.argument}`));
        store.addQuad(param, node('fno', 'type'), typeToRealType(p.type));
        store.addQuad(param, node('rdfs', 'label'), literal(p.argument));
        parameters.push(param);
        store.addQuad(paramMapping, node('fnom', 'functionParameter'), param);
        if (p.required === true) {
          store.addQuad(param, node('fno', 'required'), literal(true));
        }
        if (p.required === false) {
          store.addQuad(param, node('fno', 'required'), literal(false));
        }
      });
      store.addQuad(fn, nodes.expects, store.list(parameters));
      const methodMapping = node('fns', `MethodMapping/sparql_${fnObj.function}`);
      store.addQuad(methodMapping, nodes.a, node('fno', 'MethodMapping'));
      store.addQuad(methodMapping, nodes.a, node('fnom', 'StringMethodMapping'));
      store.addQuad(methodMapping, node('fnom', 'method-name'), literal(fnObj.function));
      store.addQuad(mapping, node('fno', 'methodMapping'), methodMapping);
      const output = node('fns', `Output/${fnObj.function}`);
      store.addQuad(output, nodes.a, node('fno', 'Output'));
      store.addQuad(output, nodes.predicate, node('fns', `Predicate/out_${fnObj.output}`));
      store.addQuad(output, nodes.type, typeToRealType(fnObj.output));
      const outputs = [];
      outputs.push(output);
      store.addQuad(fn, nodes.returns, store.list(outputs));
      const returnMapping = node('fns', `ReturnMapping/sparql_${fnObj.function}`);
      store.addQuad(returnMapping, nodes.a, node('fno', 'ReturnMapping'));
      store.addQuad(returnMapping, nodes.a, node('fnom', 'DefaultReturnMapping'));
      store.addQuad(returnMapping, node('fnom', 'functionOutput'), output);
    });
  }
  store.addQuad(fn, nodes.description, literal(o.SPARQL_description));
  // TODO categories
}

function doXpath(o, store, problem, fn, implementation) {
  // const fn = node('fns', `Function/xpath_${o.XPath.slice(3)}`);
  // store.addQuad(fn, nodes.a, nodes.fno);
  // store.addQuad(fn, nodes.solves, problem);
  // store.addQuad(fn, nodes.skosBroader, fn);
  store.addQuad(fn, nodes.name, literal(o.XPath.slice(3)));
  if (o.Xpath_signature) {
    let fns = [];
    try {
      fns = XPATHParser.parse(o.Xpath_signature);
    } catch (e) {
      console.log('XPATH ' + o.Xpath_signature);
      // console.log(e);
    }
    fns.forEach((fnObj, index) => {
      const mapping = node('fns', `Mapping/xpath_${o.XPath}_${fnObj.function}_${index}`);
      store.addQuad(mapping, nodes.a, node('fno', 'Mapping'));
      store.addQuad(mapping, node('fno', 'function'), fn);
      store.addQuad(mapping, node('fno', 'implementation'), implementation);
      store.addQuad(mapping, node('rdfs', 'seeAlso'), literal(o.XPath_iri));
      const parameters = [];
      fnObj.parameters.forEach((p, i) => {
        const paramMapping = node('fns', `ParameterMapping/xpath_${o.XPath}_${encodeURIComponent(p.type)}_${encodeURIComponent(p.argument)}`);
        store.addQuad(mapping, node('fno', 'parameterMapping'), paramMapping);
        store.addQuad(paramMapping, nodes.a, node('fno', 'ParameterMapping'));
        store.addQuad(paramMapping, nodes.a, node('fnom', 'PositionParameterMapping'));
        store.addQuad(paramMapping, node('fnom', 'implementationParameterPosition'), literal(i));
        if (p.array) {
          store.addQuad(paramMapping, node('fnom', 'repeatableParameter'), literal(true));
        }
        const param = node('fns', `Parameter/${encodeURIComponent(p.type)}_${encodeURIComponent(p.argument)}`);
        store.addQuad(param, nodes.a, node('fno', 'Parameter'));
        store.addQuad(param, node('fno', 'predicate'), node('fns', `Predicate/${encodeURIComponent(p.type)}_${encodeURIComponent(p.argument)}`));
        store.addQuad(param, node('fno', 'type'), typeToRealType(p.type));
        store.addQuad(param, node('rdfs', 'label'), literal(p.argument));
        parameters.push(param);
        store.addQuad(paramMapping, node('fnom', 'functionParameter'), param);
        if (p.required === true) {
          store.addQuad(param, node('fno', 'required'), literal(true));
        }
        if (p.required === false) {
          store.addQuad(param, node('fno', 'required'), literal(false));
        }
      });
      store.addQuad(fn, nodes.expects, store.list(parameters));
      const methodMapping = node('fns', `MethodMapping/xpath_${fnObj.function}`);
      store.addQuad(methodMapping, nodes.a, node('fno', 'MethodMapping'));
      store.addQuad(methodMapping, nodes.a, node('fnom', 'StringMethodMapping'));
      store.addQuad(methodMapping, node('fnom', 'method-name'), literal(fnObj.function));
      store.addQuad(mapping, node('fno', 'methodMapping'), methodMapping);
      const output = node('fns', `Output/${fnObj.function}`);
      store.addQuad(output, nodes.a, node('fno', 'Output'));
      store.addQuad(output, nodes.predicate, node('fns', `Predicate/out_${fnObj.output}`));
      store.addQuad(output, nodes.type, typeToRealType(fnObj.output));
      const outputs = [];
      outputs.push(output);
      store.addQuad(fn, nodes.returns, store.list(outputs));
      const returnMapping = node('fns', `ReturnMapping/xpath_${fnObj.function}`);
      store.addQuad(returnMapping, nodes.a, node('fno', 'ReturnMapping'));
      store.addQuad(returnMapping, nodes.a, node('fnom', 'DefaultReturnMapping'));
      store.addQuad(returnMapping, node('fnom', 'functionOutput'), output);
    });
  }
  store.addQuad(fn, nodes.description, literal(o.Xpath_description));
  // TODO categories
}

function doSql(o, store, problem, fn, implementation) {
  const sqlName = o.SQL.split(' or ')[0].toLowerCase();
  // const fn = node('fns', `Function/sql_${sqlName}`);
  // store.addQuad(fn, nodes.a, nodes.fno);
  // store.addQuad(fn, nodes.solves, problem);
  // store.addQuad(fn, nodes.skosBroader, broadFn);
  if (o.SQL.split(' or ').length > 1) {
    o.SQL.split(' or ').forEach(s => {
      store.addQuad(fn, nodes.name, literal(s));
    });
  } else {
    store.addQuad(fn, nodes.name, literal(o.SQL));
  }
  if (o.SQL_signature) {
    try {
      const fnObj = SQLParser.parse(o.SQL_signature)[0];
      const mapping = node('fns', `Mapping/sql_${encodeURIComponent(o.SQL)}_${o.function}`);
      store.addQuad(mapping, nodes.a, node('fno', 'Mapping'));
      store.addQuad(mapping, node('fno', 'function'), fn);
      store.addQuad(mapping, node('fno', 'implementation'), implementation);
      const parameters = [];
      fnObj.parameters.forEach((p, i) => {
        const paramMapping = node('fns', `ParameterMapping/sql_${encodeURIComponent(o.SQL)}_${p.type}_${p.argument}`);
        store.addQuad(mapping, node('fno', 'parameterMapping'), paramMapping);
        store.addQuad(paramMapping, nodes.a, node('fno', 'ParameterMapping'));
        store.addQuad(paramMapping, nodes.a, node('fnom', 'PositionParameterMapping'));
        store.addQuad(paramMapping, node('fnom', 'implementationParameterPosition'), literal(i));
        if (p.type === 'constant') {
          store.addQuad(paramMapping, nodes.a, node('fnom', 'ConstantParameterMapping'));
          store.addQuad(paramMapping, node('fnom', 'constantParameterValue'), literal(p.argument));
        }
        if (p.preConstant) {
          store.addQuad(paramMapping, nodes.a, node('fnom', 'PropertyParameterMapping'));
          store.addQuad(paramMapping, node('fnom', 'implementationProperty'), literal(p.preConstant));
        }
        if (p.array) {
          store.addQuad(paramMapping, node('fnom', 'repeatableParameter'), literal(true));
        }
        const param = node('fns', `Parameter/${p.type}_${p.argument}`);
        store.addQuad(param, nodes.a, node('fno', 'Parameter'));
        store.addQuad(param, node('fno', 'predicate'), node('fns', `Predicate/${p.type}_${p.argument}`));
        store.addQuad(param, node('fno', 'type'), typeToRealType(`${p.argument}`));
        store.addQuad(param, node('rdfs', 'label'), literal(p.argument));
        // TODO type
        parameters.push(param);
        store.addQuad(paramMapping, node('fnom', 'functionParameter'), param);
        if (p.required === true) {
          store.addQuad(param, node('fno', 'required'), literal(true));
        }
        if (p.required === false) {
          store.addQuad(param, node('fno', 'required'), literal(false));
        }
      });
      store.addQuad(fn, nodes.expects, store.list(parameters));
      const methodMapping = node('fns', `MethodMapping/sql_${fnObj.function}`);
      store.addQuad(methodMapping, nodes.a, node('fno', 'MethodMapping'));
      store.addQuad(methodMapping, nodes.a, node('fnom', 'StringMethodMapping'));
      store.addQuad(methodMapping, node('fnom', 'method-name'), literal(fnObj.function));
      store.addQuad(mapping, node('fno', 'methodMapping'), methodMapping);
      const output = node('fns', `Output/${fnObj.function}`);
      store.addQuad(output, nodes.a, node('fno', 'Output'));
      // TODO no outputType ?
      store.addQuad(output, nodes.predicate, node('fns', `Predicate/out`));
      const outputs = [];
      outputs.push(output);
      store.addQuad(fn, nodes.returns, store.list(outputs));
      const returnMapping = node('fns', `ReturnMapping/sql_${fnObj.function}`);
      store.addQuad(returnMapping, nodes.a, node('fno', 'ReturnMapping'));
      store.addQuad(returnMapping, nodes.a, node('fnom', 'DefaultReturnMapping'));
      store.addQuad(returnMapping, node('fnom', 'functionOutput'), output);
    } catch (e) {
      console.log('SQL ' + o.SQL_signature);
      // console.log(e);
    }
  }
  store.addQuad(fn, nodes.description, literal(o.SQL_description));
  // TODO categories
}

function typeToRealType(type) {
  switch (type) {
    case 'xs:boolean':
    case 'xsd:boolean':
      return node('xsd', 'boolean');
    case 'number':
    case 'numeric':
    case 'xs:numeric?':
    case 'xs:double?':
    case 'xs:double':
    case 'xsd:decimal':
    case 'xs:decimal?':
    case 'xs:decimal':
      return node('xsd', 'decimal');
    case 'array':
    case 'list':
    case 'item[]':
      return node('rdf', 'List');
    case 'str':
    case 'string':
    case 'HOUR':
    case 'MINUTE':
    case 'MONTH':
    case 'DAY':
    case 'SECOND':
    case 'YEAR':
    case 'collation_name':
    case 'embedded_string':
    case 'extraction_string':
    case 'xs:string?':
    case 'xs:string':
    case 'literal':
      return node('xsd', 'string');
    case 'date':
    case 'xsd:dateTime':
    case 'xs:dateTime?':
      return node('xsd', 'dateTime');
    case 'xsd:integer':
    case 'xs:integer?':
    case 'xs:integer':
    case 'start':
    case 'length':
    case 'starting_position':
      return node('xsd', 'integer');
    case 'expression':
    case 'xs:anyAtomicType*':
    case 'xs:anyAtomicType?':
    case 'xs:anyAtomicType':
      return node('xsd', 'anyAtomicType');
    default:
      console.error('Cannot do ' + type);
      return node('fns', '_genericType');
  }
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
