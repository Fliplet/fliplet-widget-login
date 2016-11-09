$('[data-login-id]').each(function(){
  var _this = this;
  _this.$container = $(this);
  _this.id = _this.$container.attr('data-login-id');
  _this.data = Fliplet.Widget.getData(_this.id);

  _this.pvName = 'login_component_' + _this.id;
  var dataStructure = {
    auth_token: '',
    id: '',
    email: '',
    createdAt: null
  };

  _this.$container.on('submit', (function (event) {
    event.preventDefault();

    var userEmail = _this.$container.find('.email_input').val();
    var userPassword = _this.$container.find('.pass_input').val();
    if(Fliplet.Env.get('platform') === 'web'){
      login({
        'email': userEmail,
        'password' : userPassword
      }).then(function(response) {
        _this.loginPV.auth_token = response.auth_token;
        _this.loginPV.email = response.email;
        Fliplet.Security.Storage.update().then(function(){
          return validateAppAccess();
        });
      }).then(function(){
        Fliplet.Navigate.to(_this.data.action);
      },function(){
        alert("Not a valid Fliplet account login");
      });
    } else {
      Fliplet.Native.Authentication.loginUser({
        email: userEmail,
        password: userPassword
      }).then(function() {
        return validateAppAccess();
      }).then(function(){
        Fliplet.Navigate.to(_this.data.action);
      },function(){
        navigator.alert("Not a valid Fliplet account login");
      });
    }

  }));

  function init(){
    Fliplet.Security.Storage.init().then(function(){
      Fliplet.Security.Storage.create(_this.pvName, dataStructure).then(
        function(data) {
          _this.loginPV = data;

          if(Fliplet.Env.get('platform') === 'web') {
            validateWeb().then(function(){
              return validateAppAccess();
            }).then(function(){
              Fliplet.Navigate.to(_this.data.action);
            },function(){
              _this.$container.removeClass('hidden');
            });
          } else {
            Fliplet.User.setUserDetails(_this.loginPV);
            Fliplet.Native.Authentication.saveUserDetails(_this.loginPV).then(function(){
              return Fliplet.Native.Authentication.verifyLogin();
            }).then(function(){
              return validateAppAccess();
            }).then(function(){
              Fliplet.Navigate.to(_this.data.action);
            },function(){
              _this.$container.removeClass('hidden');
            })
          }
        }
      );
    });
  }

  function validateAppAccess(){
    return new Promise(function(resolve, reject){
      getApps().then(function(response) {
        if(_.find(response.apps,{id: Fliplet.Env.get('appId')})) {
          return resolve();
        }
        return reject();
      });
    });
  }


  function validateWeb(){
    //validate token
    return request({
      'method' : 'GET',
      'url' : 'v1/user',
      'token' : _this.loginPV.auth_token
    });
  }

  function login(options) {
    return request({
      'method' : 'POST',
      'url' : 'v1/auth/login',
      'data' : {
        'email' : options.email,
        'password' : options.password
      }
    });
  }

  function request(data){
    //validate token
    return Fliplet.Navigator.onReady().then(function () {
      data.url = Fliplet.Env.get('apiUrl') + data.url;
      data.headers = data.headers || {};
      data.headers['Auth-token'] = data.token;
      return $.ajax(data);
    });
  }

  function getApps(){
    var apps = [];

    if(Fliplet.Env.get('platform') === 'web'){
      return request({
        'method' : 'GET',
        'url' : 'v1/apps',
        'token' : _this.loginPV.auth_token
      });
    } else {
      return Fliplet.Apps.get();
    }
  }

  if(Fliplet.Env.get('platform') === 'web') {
     init();
    _this.$container.parent().on("fliplet_page_reloaded", init);
  } else {
    document.addEventListener("deviceready", init);
  }
});
