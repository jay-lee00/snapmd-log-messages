// Declare app level module which depends on views, and components
var app = angular.module('LogMessagesViewerApp', ['ui.bootstrap', 'ngLoadingSpinner']);

app.factory('snapmdRoot', function() {
    var snapmdRoot = JSON.parse(localStorage.snapmdRoot || "{}");
    var data = {};

    snapmdRoot.save = function() {
        localStorage.snapmdRoot = JSON.stringify(snapmdRoot);
    };

    snapmdRoot.getHeaders = function (accessToken) {
        var headers = {
                'Content-Type': 'application/json; charset=utf-8',
                'X-Developer-Id': snapmdRoot.developerId,
                'X-Api-Key': snapmdRoot.apiKey,
            };
        if (typeof accessToken != 'undefined') {
            headers['Authorization'] = 'Bearer ' + accessToken;
        }

        return headers;
    };

    snapmdRoot.getApiUrl = function(api) {
        return this.apiRoot + '/' + api;
    };

    snapmdRoot.data = function(f, v) {
        if (v === null)
            delete data[f];
        else if (v !== undefined) 
            data[f] = v;

        return data[f];
    };

    return snapmdRoot;
});

app.controller('msgLogViewerController', ['$scope', '$modal', 'apiComService', 'snapmdRoot', function ($scope, $modal, apiComService, snapmdRoot) {
	$scope.snapmdRoot = snapmdRoot;
    $scope.emailAddress = sessionStorage.userEmail;
    $scope.userPassword = sessionStorage.userPassword;
    $scope.saveLogin = sessionStorage.userSaveLogin == 'true';

    $scope.title = 'SnapMD LogMessages';
    $scope.tokenMessage = 'Not Logged In';
    $scope.tokenStatus = 'alert-warning';
    $scope.hospitalId = 0;
    $scope.userTypeId = 3;

    $(document).keydown(function( event ) {
        if (event.shiftKey && event.ctrlKey) {
            $scope.$apply(function() {
                $scope.showSaveLogin = !$scope.showSaveLogin;
            });
            event.preventDefault();
        }
    });

    $scope.onSaveLoginChange = function() {
        sessionStorage.userSaveLogin = $scope.saveLogin;
    }

    $scope.shortStr = function(x, max) {
        var s = x.substr(0, max || 32);
        return s + (x.length > s.length? ' ...': '')
    };

    $scope.showLogMessage = function(x) {
        snapmdRoot.data('message', x);
        $modal.open({
            template: $('#log-message-form').html(),
            controller: ['$scope', '$modalInstance', 'snapmdRoot', function($scope, $modalInstance, snapmdRoot) {
                    $scope.logMessage = snapmdRoot.data('message');
                    $scope.logMessageJson = JSON.stringify($scope.logMessage);
                    $scope.close = function() {
                        $modalInstance.dismiss('close');
                    };
                }
            ]
        });
    };

    $scope.snapmdRootModalOpen = function() {
        $modal.open({
            template: $('#snapmd-root-form').html(),
            controller: ['$scope', '$modalInstance', 'snapmdRoot', function($scope, $modalInstance, snapmdRoot) {
                    $scope.apiRoot = snapmdRoot.apiRoot;
                    $scope.apiKey = snapmdRoot.apiKey;
                    $scope.developerId = snapmdRoot.developerId;
                    $scope.save = function() {
                        snapmdRoot.apiRoot = $scope.apiRoot;
                        snapmdRoot.apiKey = $scope.apiKey;
                        snapmdRoot.developerId = $scope.developerId;
                        snapmdRoot.save();
                        $modalInstance.close();
                    };
                    $scope.cancel = function() {
                        $modalInstance.dismiss('cancel');
                    };
                }
            ]
        });
    };

    function twoDigit(x) {
        return (x < 10? '0': '') + x;
    }
		
    $scope.doGetToken = function () {
        if ($scope.saveLogin) {
            sessionStorage.userEmail = $scope.emailAddress;
            sessionStorage.userPassword = $scope.userPassword;
        } else {
            delete sessionStorage.userEmail;
            delete sessionStorage.userPassword;
        }
        var params = {
            email: $scope.emailAddress,
            password: $scope.userPassword,
            userTypeId: $scope.userTypeId,
            hospitalId: $scope.hospitalId,
            success: function (data) {
                $scope.accessToken = data.data[0];
                $scope.tokenStatus = 'alert-success';
                var expires = new Date($scope.accessToken.expires);
                function checkTokenExpiration() {
                    var now = new Date();
                    if (now > expires) {
                        $scope.tokenStatus = 'alert-danger';
                    }
                    if ($scope.tokenStatus == 'alert-success') {
                        setTimeout(checkTokenExpiration, 1000);
                        var ts = (expires - now) / 1000;
                        var sc = Math.round(ts % 60); ts /= 60;
                        var mn = Math.round(ts % 60);
                        var hr = Math.floor(ts / 60);
                        $scope.$apply(function () {
                            $scope.tokenMessage = 'Token expires in ' + twoDigit(hr) + ':' + twoDigit(mn) + ':' + twoDigit(sc);
                        });
                    }
                }
                checkTokenExpiration();
            },
            error: function (data) {
                $scope.accessToken = {};
                $scope.tokenMessage = 'Error getting access token';
                $scope.tokenStatus = 'alert-danger';
                console.log(data);
            }
        };
        apiComService.getToken(params);
    };

    $scope.doGetLogMessages = function() {
        var p = {};
        if ($scope.searchText) {
            var txt = $scope.searchText;
            var re = /^[{]?[0-9a-fA-F]{8}[-]?([0-9a-fA-F]{4}[-]?){3}[0-9a-fA-F]{12}[}]?$/;
            if (re.test(txt)) p.id = txt;
            else p.searchText = txt;
        }
        if ($scope.messageTypes) {
            p.messageTypes = $scope.messageTypes.split(',').map(function(x) {
                return $.trim(x);
            });
        }
        var params = {
            id: p.id,
            searchText: p.searchText,
            messageTypes: p.messageTypes,
            accessToken: $scope.accessToken.access_token,
            success: function(data) {
                $scope.logMessagesData = data;
                $scope.logMessagesJson = JSON.stringify(data, null, 2);
                $scope.logMessagesStatus = 'alert-success';
                $scope.logMessagesMessage = 'searching ' + JSON.stringify(p);
            },
            error: function(data) {
                $scope.logMessages = 'Error getting LogMessages';
                $scope.logMessagesStatus = 'alert-danger';
                $scope.logMessagesMessage = 'searching ' + JSON.stringify(p) + ', error: ' + data;
            }
        };
        apiComService.getLogMessages(params);
    };

}]);

app.service('apiComService', function ($http, snapmdRoot) {
    this.getToken = function (params) {
        var requestInfo = {
            headers: snapmdRoot.getHeaders(),
            url: snapmdRoot.getApiUrl('v2/account/token'),
            method: 'POST',
            data: {
                UserTypeId: params.userTypeId,
                HospitalId: params.hospitalId,
                Email: params.email,
                Password: params.password
            }
        };
        $http(requestInfo).
            success(function (data, status, headers, config) {
                if (typeof params.success != 'undefined') {
                    params.success(data);
                }
            }).
            error(function (data, status, headers, config) {
                if (typeof params.error != 'undefined') {
                    params.error(status + ': ' + data);
                }
            });
    };

    this.getLogMessages = function(params) {
        var qstr = '';
        if (params.id) qstr = '?id=' + params.id;
        else if (params.searchText) qstr = '?searchText=' + encodeURIComponent(params.searchText);
        if (params.messageTypes) {
            qstr = qstr || '?mt=true';
            for (var mti in params.messageTypes) {
                var mt = params.messageTypes[mti];
                if (mt) qstr += '&messageTypes=' + mt; 
            } 
        }
        var requestInfo = {
            headers: snapmdRoot.getHeaders(params.accessToken),
            url: snapmdRoot.getApiUrl('v2/admin/log-messages' + qstr),
            method: 'GET',
        };
        $http(requestInfo).
        success(function (data, status, headers, config) {
            if (typeof params.success != 'undefined') {
                params.success(data);
            }
        }).
        error(function (data, status, headers, config) {
            if (typeof params.error != 'undefined') {
                params.error(status + ': ' + data);
            }
        });
    };
});
