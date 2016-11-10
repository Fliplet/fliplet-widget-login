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

  document.addEventListener('offline',function (){
    _this.$container.addClass('offline');
  });

  scheduleCheck();

  _this.$container.on('submit', (function (event) {
    event.preventDefault();

    var userEmail = _this.$container.find('.email_input').val();
    var userPassword = _this.$container.find('.pass_input').val();

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
      alert("Not a valid Fliplet account login with app access.");
    });

  }));

  function init(){
    Fliplet.Security.Storage.init().then(function(){
      Fliplet.Security.Storage.create(_this.pvName, dataStructure).then(
        function(data) {
          _this.loginPV = data;

          if(!Fliplet.Navigator.isOnline && _this.loginPV.auth_token) {
            Fliplet.Navigate.to(_this.data.action);
            return;
          }
          if(_this.loginPV.auth_token === "") {
            _this.$container.removeClass('hidden');
            return;
          }
          validateWeb().then(function(){
            return validateAppAccess();
          }).then(function(){
            Fliplet.Navigate.to(_this.data.action);
          },function(){
            _this.$container.removeClass('hidden');
          });
        }
      );
    });
  }

  function validateAppAccess(){
    return new Promise(function(resolve, reject){
      getApps().then(function(apps) {
        if(_.find(apps,{id: Fliplet.Env.get('appId')})) {
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
      }).then(function (response) {
        return Promise.resolve(response.apps);
      }, function (error) {
        return Promise.reject(error);
      });
    } else {
      return Fliplet.Apps.get();
    }
  }

  function scheduleCheck(){
    setTimeout(function(){
      if(Fliplet.Navigator.isOnline){
        _this.$container.removeClass('offline');
        return
      }
      scheduleCheck();
    },500);
  }

  if(Fliplet.Env.get('platform') === 'web') {

    if(Fliplet.Env.get('interact')) {
      setTimeout(function() {
        $('[data-login-id=' + _this.id + ']').removeClass('hidden').removeClass('hidden');
      },500)
    }else {
      init();
    }

    Fliplet.Studio.onEvent(function (event) {
      if (event.detail.event === 'reload-widget-instance') {
        setTimeout(function() {
          $('[data-login-id=' + _this.id + ']').removeClass('hidden').removeClass('hidden');
        },500)
      }
    });
    _this.$container.on("fliplet_page_reloaded", function(){
      if(Fliplet.Env.get('interact')) {
        setTimeout(function() {
          $('[data-login-id=' + _this.id + ']').removeClass('hidden').removeClass('hidden');
        },500)
      }
    });
  } else {
    document.addEventListener("deviceready", init);
  }
});
