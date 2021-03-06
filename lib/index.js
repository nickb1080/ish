var fs = require("fs");
var vm = require("vm");
var path = require("path");
var repl = require("repl");

var callsite = require("callsite");
var makeModule = require("make-module");
var cc = require("change-case");

var evalInModule = fs.readFileSync(path.join(__dirname, "./eval.js"));

module.exports = main;
function main (settings) {

  if (settings == null || settings.files == null || !Array.isArray(settings.files))
    throw new TypeError("Requires a settings object with a `files` property");

  var bin = path.resolve(path.join(__dirname, "../bin/ish"));
  var caller = callsite()[1].getFileName();

  settings.location = (caller === bin ? process.cwd() : path.dirname(caller));

  return settings.files
    .map(moduleFromScript(settings))
    .map(injectModuleExports(settings))
    .map(injectModuleExportsProps(settings));
}

function moduleFromScript (settings) {
  return function actualProcess (script) {

    var dest = path.join(settings.location, script.path);
    var code = parseFile(dest, settings);

    if (settings.topLevelVars) code += evalInModule;

    var mdl = makeModule(code, dest);

    if (mdl.error) throw mdl.error;

    mdl.path = dest;
    mdl.name = script.name;

    return mdl;
  }
}

function injectModuleExports (settings) {
  return function actualInjectExports (mdl) {
    var name = mdl.name ? mdl.name : moduleNameFromPath(mdl.path);
    var method = cc.isUpperCase(name.charAt(0)) ? "pascalCase" : "camelCase";
    name = cc[method](name);
    global[name] = mdl.exports;
    mdl.name = name;
    return mdl;
  }
}

function injectModuleExportsProps (settings) {
  return function actualInjectProps (mdl) {
    if (settings.moduleExportProps)
      Object.keys(mdl.exports).forEach(function (key) {
        global[key] = mdl.exports[key];
      });
    return mdl;
  }
}

function moduleNameFromPath (filePath) {
  var base = path.basename(filePath);
  var ext = path.extname(filePath);
  return ext ? base.slice(0, -1 * ext.length) : base;
}

function parseFile (filepath, settings) {
  var ext = path.extname(filepath);

  if (ext === "") {
    filepath += ".js";
    ext = ".js";
  }

  var codeAsString = fs.readFileSync(filepath).toString();

  if (settings.babel) {
    require("babel/register");
    require("babel/polyfill");
    codeAsString = require("babel").transform(codeAsString).code;
  }

  switch (ext) {
    case ".js":
      return codeAsString;
    case ".coffee":
      var CoffeeScript = require("coffee-script");
      CoffeeScript.register();
      return CoffeeScript.compile(codeAsString, {
        bare: true
      });
    default:
      throw new Error("No extension registered for " + ext);
  }
}
