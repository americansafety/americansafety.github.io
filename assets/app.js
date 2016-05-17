angular.module('snapbrim', ['ui.bootstrap', 'plunker', 'ngTouch', 'ngAnimate', 'ngSanitize'], function($httpProvider){
  if (!!window.FastClick) {
    FastClick.attach(document.body);
  }
  delete $httpProvider.defaults.headers.common['X-Requested-With'];
}).run(['$location', function($location){
  //Allows us to navigate to the correct element on initialization
  if ($location.path() !== '' && $location.path() !== '/') {
    smoothScroll(document.getElementById($location.path().substring(1)), 500, function(el) {
      location.replace('#' + el.id);
    });
  }
}])

.controller('MainCtrl', MainCtrl)
function MainCtrl($scope, $http, $document, $uibModal, orderByFilter) {
  // Grab old version docs
  $http.get('/bootstrap/versions-mapping.json')
    .then(function(result) {
      $scope.oldDocs = result.data;
    });

  $scope.showBuildModal = function() {
    var modalInstance = $uibModal.open({
      templateUrl: 'buildModal.html',
      controller: 'SelectModulesCtrl',
      resolve: {
        modules: function(buildFilesService) {
          return buildFilesService.getModuleMap()
            .then(function (moduleMap) {
              return Object.keys(moduleMap);
            });
        }
      }
    });
  };

  $scope.showDownloadModal = function() {
    var modalInstance = $uibModal.open({
      templateUrl: 'downloadModal.html',
      controller: 'DownloadCtrl'
    });
  };
}

function SelectModulesCtrl($scope, $uibModalInstance, modules, buildFilesService) {
  $scope.selectedModules = [];
  $scope.modules = modules;

  $scope.selectedChanged = function(module, selected) {
    if (selected) {
      $scope.selectedModules.push(module);
    } else {
      $scope.selectedModules.splice($scope.selectedModules.indexOf(module), 1);
    }
  };

  $scope.downloadBuild = function () {
    $uibModalInstance.close($scope.selectedModules);
  };

  $scope.cancel = function () {
    $uibModalInstance.dismiss();
  };

  $scope.isOldBrowser = function () {
    return isOldBrowser;
  };

  $scope.build = function (selectedModules, version) {
    /* global JSZip, saveAs */
    var moduleMap, rawFiles;

    buildFilesService.get().then(function (buildFiles) {
      moduleMap = buildFiles.moduleMap;
      rawFiles = buildFiles.rawFiles;

      generateBuild();
    });

    function generateBuild() {
      var srcModuleNames = selectedModules
      .map(function (module) {
        return moduleMap[module];
      })
      .reduce(function (toBuild, module) {
        addIfNotExists(toBuild, module.name);

        module.dependencies.forEach(function (depName) {
          addIfNotExists(toBuild, depName);
        });
        return toBuild;
      }, []);

      var srcModules = srcModuleNames
      .map(function (moduleName) {
        return moduleMap[moduleName];
      });

      var srcModuleFullNames = srcModules
      .map(function (module) {
        return module.moduleName;
      });

      var srcJsContent = srcModules
      .reduce(function (buildFiles, module) {
        return buildFiles.concat(module.srcFiles);
      }, [])
      .map(getFileContent)
      .join('\n')
      ;

      var jsFile = createNoTplFile(srcModuleFullNames, srcJsContent);

      var tplModuleNames = srcModules
      .reduce(function (tplModuleNames, module) {
        return tplModuleNames.concat(module.tplModules);
      }, []);

      var tplJsContent = srcModules
      .reduce(function (buildFiles, module) {
        return buildFiles.concat(module.tpljsFiles);
      }, [])
      .map(getFileContent)
      .join('\n')
      ;

      var jsTplFile = createWithTplFile(srcModuleFullNames, srcJsContent, tplModuleNames, tplJsContent);

      var cssContent = srcModules
      .map(function (module) {
        return module.css;
      })
      .filter(function (css) {
        return css;
      })
      .join('\n')
      ;

      var cssJsContent = srcModules
      .map(function (module) {
        return module.cssJs;
      })
      .filter(function (cssJs) {
        return cssJs;
      })
      .join('\n')
      ;

      var footer = cssJsContent;

      var zip = new JSZip();
      zip.file('ui-bootstrap-custom-' + version + '.js', rawFiles.banner + jsFile + footer);
      zip.file('ui-bootstrap-custom-' + version + '.min.js', rawFiles.banner + uglify(jsFile + footer));
      zip.file('ui-bootstrap-custom-tpls-' + version + '.js', rawFiles.banner + jsTplFile + footer);
      zip.file('ui-bootstrap-custom-tpls-' + version + '.min.js', rawFiles.banner + uglify(jsTplFile + footer));
      zip.file('ui-bootstrap-custom-tpls-' + version + '.min.js', rawFiles.banner + uglify(jsTplFile + footer));

      if (cssContent) {
        zip.file('ui-bootstrap-custom-' + version + '-csp.css', rawFiles.cssBanner + cssContent);
      }

      saveAs(zip.generate({type: 'blob'}), 'ui-bootstrap-custom-build.zip');
    }

    function createNoTplFile(srcModuleNames, srcJsContent) {
      return 'angular.module("ui.bootstrap", [' + srcModuleNames.join(',') + ']);\n' +
        srcJsContent;
    }

    function createWithTplFile(srcModuleNames, srcJsContent, tplModuleNames, tplJsContent) {
      var depModuleNames = srcModuleNames.slice();
      depModuleNames.unshift('"ui.bootstrap.tpls"');

      return 'angular.module("ui.bootstrap", [' + depModuleNames.join(',') + ']);\n' +
        'angular.module("ui.bootstrap.tpls", [' + tplModuleNames.join(',') + ']);\n' +
        srcJsContent + '\n' + tplJsContent;

    }

    function addIfNotExists(array, element) {
      if (array.indexOf(element) == -1) {
        array.push(element);
      }
    }

    function getFileContent(fileName) {
      return rawFiles.files[fileName];
    }

    function uglify(js) {
      /* global UglifyJS */

      var ast = UglifyJS.parse(js);
      ast.figure_out_scope();

      var compressor = UglifyJS.Compressor();
      var compressedAst = ast.transform(compressor);

      compressedAst.figure_out_scope();
      compressedAst.compute_char_frequency();
      compressedAst.mangle_names();

      var stream = UglifyJS.OutputStream();
      compressedAst.print(stream);

      return stream.toString();
    }
  };
}
})();
