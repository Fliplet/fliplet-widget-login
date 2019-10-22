$('[data-login-id]').each(function() {
  var _this = this;
  var TWO_FACTOR_ERROR_CODE = 428;
  var ONE_TIME_2FA_OPTION = 'onetime';
  var genericErrorMessage = '<p>Unable to login. Try again later.</p>';
  var LABELS = {
    loginDefault: 'Log in',
    loginProcessing: 'Logging in...',
    authDefault: 'Verify',
    authProcessing: 'Verifying...',
    sendDefault: 'Send new code',
    sendProcessing: 'Sending...'
  };
  _this.$container = $(this);
  _this.id = _this.$container.attr('data-login-id');
  _this.data = Fliplet.Widget.getData(_this.id);
  _this.pvNameStorage = 'fliplet_login_component';

  // Do not track login related redirects
  if (typeof _this.data.action !== 'undefined') {
    _this.data.action.track = false;
  }

  var loginOptions;
  var userEnteredCode;
  var userPassword;

  document.addEventListener('offline', function() {
    _this.$container.addClass('login-offline');
    scheduleCheck();
  });

  if (Fliplet.Navigate.query.error) {
    _this.$container.find('.login-error-holder').html(Fliplet.Navigate.query.error);
  }

  // INITIATE FUNCTIONS
  function calculateElHeight(el) {
    if (el.hasClass('start')) {
      $('.state[data-state=auth]').removeClass('start').addClass('present');
    }
    var elementHeight = el.outerHeight();
    el.parents('.content-wrapper').css('height', elementHeight);
    el.css('overflow', 'auto');
  }

  function createUserProfile(response) {
    response = response || {};
    if (!response.id || !response.region) {
      console.warn('Could not create user object for Fliplet.Profile');
      return;
    }

    return {
      type: 'fliplet',
      id: response.id,
      region: response.region
    };
  }

  $('.login-form').on('submit', function(e) {
    e.preventDefault();

    _this.$container.find('.btn-login').addClass('disabled');
    _this.$container.find('.btn-login').html(LABELS.loginProcessing);
    _this.$container.find('.login-error-holder').removeClass('show');
    _this.$container.find('.login-error-holder').html('');

    var passwordMustBeChanged;
    var userEmail = _this.$container.find('.login_email').val();
    userPassword = _this.$container.find('.login_password').val();

    loginOptions = {
      email: userEmail,
      password: userPassword,
      session: true,
      passport: true
    };

    login(loginOptions).then(function(response) {
      passwordMustBeChanged = response.policy
        && response.policy.password
        && response.policy.password.mustBeChanged;

      Fliplet.Analytics.trackEvent({
        category: 'login_fliplet',
        action: 'login_pass'
      });

      return updateUserData({
        id: response.id,
        region: response.region,
        userRoleId: response.userRoleId,
        authToken: response.auth_token,
        email: response.email,
        legacy: response.legacy
      });
    }).then(function() {
      _this.$container.find('.btn-login').removeClass('disabled');
      _this.$container.find('.btn-login').html(LABELS.loginDefault);

      if (passwordMustBeChanged) {
        $('.state.present').removeClass('present').addClass('past');
        $('.state[data-state=force-update-pass]').removeClass('future').addClass('present');
        calculateElHeight($('.state.present'));
        return;
      }

      if (Fliplet.Env.get('disableSecurity')) {
        console.log('Redirection to other screens is disabled when security isn\'t enabled.');
        return Fliplet.UI.Toast('Login successful');
      }
      Fliplet.Navigate.to(_this.data.action);
    }).catch(function(err) {
      console.error(err);
      _this.$container.find('.btn-login').removeClass('disabled');
      _this.$container.find('.btn-login').html(LABELS.loginDefault);
      if (err && err.status === TWO_FACTOR_ERROR_CODE) {
        Fliplet.Analytics.trackEvent({
          category: 'login_fliplet',
          action: 'login_2fa_required'
        });

        if (err.responseJSON.condition !== ONE_TIME_2FA_OPTION) {
          $('.two-factor-resend').removeClass('hidden');
        }
        $('.state.present').removeClass('present').addClass('past');
        $('.state[data-state=two-factor-code]').removeClass('future').addClass('present');
        calculateElHeight($('.state.present'));
        return;
      }

      Fliplet.Analytics.trackEvent({
        category: 'login_fliplet',
        action: 'login_fail'
      });

      var errorMessage = (err && err.message || err.description) || genericErrorMessage;
      if (err && err.responseJSON) {
        errorMessage = err.responseJSON.message;
      }

      _this.$container.find('.login-error-holder').html(errorMessage);
      _this.$container.find('.login-error-holder').addClass('show');
      calculateElHeight($('.state.present'));
    });

  });

  $('.btn-forgot-pass').on('click', function() {
    $('.state.present').removeClass('present').addClass('past');
    $('[data-state="forgot-email"]').removeClass('future').addClass('present');
    calculateElHeight($('.state.present'));
  });

  $('.btn-forgot-back').on('click', function() {
    $('.state.present').removeClass('present').addClass('future');
    $('[data-state="auth"]').removeClass('past').addClass('present');
    calculateElHeight($('.state.present'));
  });

  $('.btn-forgot-cancel').on('click', function() {
    $('[data-state="forgot-new-pass"]').removeClass('present past').addClass('future');
    $('[data-state="forgot-code"]').removeClass('present past').addClass('future');
    $('[data-state="forgot-email"]').removeClass('past').addClass('future');
    $('[data-state="auth"]').removeClass('past').addClass('present');
    calculateElHeight($('.state.present'));
  });

  $('.fliplet-forgot-password').on('submit', function(e) {
    e.preventDefault();
    $('.forgot-verify-error').addClass('hidden');
    email = $('.forgot-email-address').val();

    Fliplet.Analytics.trackEvent({
      category: 'login_fliplet',
      action: 'forgot_password'
    });

    return Fliplet.API.request({
      method: 'POST',
      url: 'v1/auth/forgot?method=code',
      data: {
        email: email
      }
    }).then(function onRecoverPassCodeSent() {
      $('.forgot-verify-user-email').text(email);
      $('.state.present').removeClass('present').addClass('past');
      $('[data-state="forgot-code"]').removeClass('future').addClass('present');
      calculateElHeight($('.state.present'));
    });
  });

  $('.fliplet-verify-code').on('submit', function(e) {
    e.preventDefault();
    userEnteredCode = $('[name="forgot-verification-code"]').val();

    $('.state.present').removeClass('present').addClass('past');
    $('[data-state="forgot-new-pass"]').removeClass('future').addClass('present');
    calculateElHeight($('.state.present'));
  });

  $('.fliplet-new-password').on('submit', function(e) {
    e.preventDefault();
    $('.forgot-new-password-error').addClass('hidden');
    $('.btn-reset-pass').html('Resetting...').addClass('disabled');

    // Checks if passwords match
    var password = $('.forgot-new-password').val();
    var confirmation = $('.forgot-confirm-password').val();

    if (password !== confirmation) {
      $('.forgot-new-password-error').removeClass('hidden');
      $('.btn-reset-pass').html('Reset password').removeClass('disabled');
      calculateElHeight($('.state.present'));
      return;
    }

    return Fliplet.API.request({
      method: 'POST',
      url: 'v1/auth/reset/' + userEnteredCode,
      data: {
        email: email,
        password: password
      }
    }).then(function() {
      $('.state.present').removeClass('present').addClass('past');
      $('[data-state="reset-success"]').removeClass('future').addClass('present');
      $('.btn-reset-pass').html('Reset password').removeClass('disabled');
      calculateElHeight($('.state.present'));
    }).catch(function() {
      $('.state.present').removeClass('present').addClass('future');
      $('[data-state="forgot-code"]').removeClass('past').addClass('present');
      $('.forgot-verify-error').removeClass('hidden');
      $('.btn-reset-pass').html('Reset password').removeClass('disabled');
      calculateElHeight($('.state.present'));
    });
  });

  $('.fliplet-force-update-password').on('submit', function(e) {
    e.preventDefault();
    $('.force-update-new-password-error').addClass('hidden');
    $('.btn-force-update-pass').html('Updating...').addClass('disabled');

    // Checks if passwords match
    var password = $('.force-update-new-password').val();
    var confirmation = $('.force-update-confirm-password').val();

    if (password !== confirmation) {
      $('.force-update-new-password-error').removeClass('hidden');
      $('.btn-force-update-pass').html('Update password').removeClass('disabled');
      calculateElHeight($('.state.present'));
      return;
    }

    return Fliplet.API.request({
      method: 'PUT',
      url: 'v1/user',
      data: {
        currentPassword: userPassword,
        newPassword: password
      }
    }).then(function() {
      if (Fliplet.Env.get('disableSecurity')) {
        $('.btn-force-update-pass').html('Update password').removeClass('disabled');
        console.log('Redirection to other screens is disabled when security isn\'t enabled.');
        return Fliplet.UI.Toast('Password updated');
      }

      Fliplet.UI.Toast('Password updated');

      Fliplet.Navigate.to(_this.data.action);
    }).catch(function(err) {
      $('.force-update-new-password-error').html(err.responseJSON.message).removeClass('hidden');
      $('.btn-force-update-pass').html('Update password').removeClass('disabled');
      calculateElHeight($('.state.present'));
    });
  });

  $('.btn-reset-success').on('click', function() {
    $('.state.present').removeClass('present').addClass('past');
    $('[data-state="auth"]').removeClass('past').addClass('present');
    calculateElHeight($('.state.present'));
  });

  $('span.back').on('click', function() {
    $('.state.present').removeClass('present').addClass('future');
    $('[data-state="auth"]').removeClass('past').addClass('present');
    calculateElHeight($('.state.present'));
  });

  $('.two-factor-resend').on('click', function() {
    var _that = $(this);
    $('.help-two-factor').addClass('hidden');
    _that.addClass('disabled');
    _that.html(LABELS.sendProcessing);

    calculateElHeight($('.state[data-state=two-factor-code]'));
    return login(loginOptions).catch(function(err) {
      if (err.status === TWO_FACTOR_ERROR_CODE) {
        _that.removeClass('disabled');
        _that.html(LABELS.sendDefault);
        $('.two-factor-sent').removeClass('hidden');
        calculateElHeight($('.state[data-state=two-factor-code]'));
        return;
      }
      _that.removeClass('disabled');
      _that.html(LABELS.sendDefault);
      $('.two-factor-unable-to-resend').removeClass('hidden');
      calculateElHeight($('.state[data-state=two-factor-code]'));
    });
  });

  $('.fliplet-two-factor').on('submit', function(e) {
    e.preventDefault();
    var twoFactorCode = $('.two-factor-code').val();
    _this.$container.find('.two-factor-btn').addClass('disabled').html(LABELS.authProcessing);

    if (twoFactorCode === '') {
      $('.two-factor-not-valid').removeClass('hidden');
      calculateElHeight($('.state[data-state=two-factor-code]'));
      return;
    }
    $('.help-two-factor').addClass('hidden');
    loginOptions.twofactor = twoFactorCode;
    login(loginOptions).then(function(userData) {
      Fliplet.Analytics.trackEvent({
        category: 'login_fliplet',
        action: 'login_pass'
      });

      return updateUserData({
        id: userData.id,
        region: userData.region,
        userRoleId: userData.userRoleId,
        authToken: userData.auth_token,
        email: userData.email,
        legacy: userData.legacy
      });
    }).then(function() {
      _this.$container.find('.two-factor-btn').removeClass('disabled').html(LABELS.authDefault);

      if (Fliplet.Env.get('disableSecurity')) {
        return;
      }

      Fliplet.Navigate.to(_this.data.action);
    }).catch(function(error) {
      _this.$container.find('.two-factor-btn').removeClass('disabled').html(LABELS.authDefault);
      $('.two-factor-not-valid').removeClass('hidden');
      calculateElHeight($('.state[data-state=two-factor-code]'));
    });
  });

  function showStart(){
    setTimeout(function(){
      var $loginHolder = _this.$container.find('.login-loader-holder');
      $loginHolder.fadeOut(100, function() {
        _this.$container.find('.content-wrapper').show();
        calculateElHeight($('.state.start'));
      });
    }, 100);
  }

  function updateUserData(data) {
    var user = createUserProfile({
      region: data.region,
      id: data.id
    });

    var promises = [
      Fliplet.App.Storage.set(_this.pvNameStorage, {
        userRoleId: data.userRoleId,
        auth_token: data.authToken,
        email: data.email
      }),
      Fliplet.Profile.set({
        email: data.email,
        user: user
      })
    ];

    return Promise.all(promises);
  }

  function init() {
    Fliplet.User.getCachedSession()
      .then(function(session) {
        var passport = session && session.accounts && session.accounts.flipletLogin;

        if (passport) {
          session.user = _.extend(session.user, passport[0]);
          session.user.type = null;
        }

        if (!session || !session.user || session.user.type !== null) {
          return Promise.reject('Login session not found');
        }

        // Update stored email address based on retrieved session
        return updateUserData({
          id: session.user.id,
          region: session.auth_token.substr(0, 2),
          userRoleId: session.user.userRoleId,
          authToken: session.auth_token,
          email: session.user.email,
          legacy: session.legacy
        });
      })
      .then(function () {
        if (!Fliplet.Navigator.isOnline()) {
          return Promise.resolve();
        }

        return validateWeb()
          .then(function (response) {
            // Update stored email address based on retrieved response
            return updateUserData({
              id: response.user.id,
              region: response.region,
              userRoleId: response.user.userRoleId,
              authToken: response.user.auth_token,
              email: response.user.email,
              legacy: response.user.legacy
            });
          });
      })
      .then(function () {
        if (Fliplet.Env.get('disableSecurity')) {
          return Promise.reject('Login verified. Redirection is disabled when security isn\'t enabled.');
        }

        if (Fliplet.Env.get('interact')) {
          return Promise.reject('Login verified. Redirection is disabled when editing screens.');
        }

        var navigate = Fliplet.Navigate.to(_this.data.action);
        if (typeof navigate === 'object' && typeof navigate.then === 'function') {
          return navigate;
        }
        return Promise.resolve();
      })
      .catch(function (error) {
        console.warn(error);
        showStart();
      });
  }

  function validateWeb() {
    //validate token
    return Fliplet.App.Storage.get(_this.pvNameStorage)
      .then(function (storage) {
        return request({
          method: 'GET',
          url: 'v1/user',
          token: storage.auth_token
        });
      });
  }

  function login(options) {
    return Fliplet.Session.run({
      method: 'POST',
      url: 'v1/auth/login',
      data: options
    });
  }

  function request(data) {
    //validate token
    return Fliplet.Navigator.onReady().then(function() {
      data.url = Fliplet.Env.get('apiUrl') + data.url;
      data.headers = data.headers || {};
      data.headers['Auth-token'] = data.token;
      return $.ajax(data);
    });
  }

  function scheduleCheck() {
    setTimeout(function() {
      if (Fliplet.Navigator.isOnline()) {
        _this.$container.removeClass('login-offline');
        return;
      }
      scheduleCheck();
    }, 500);
  }

  if (Fliplet.Env.get('platform') === 'web') {

    init();

    if (Fliplet.Env.get('interact')) {
      // Disables password fields in edit mode to avoid password autofill
      $('input[type="password"]').prop('disabled', true);
    }

    Fliplet.Studio.onEvent(function(event) {
      if (event.detail.event === 'reload-widget-instance') {
        setTimeout(function() {
          _this.$container.removeClass('hidden');
        }, 500);
      }
    });
    _this.$container.on("fliplet_page_reloaded", function() {
      if (Fliplet.Env.get('interact')) {
        setTimeout(function() {
          _this.$container.removeClass('hidden');
        }, 500);
      }
    });
  } else {
    document.addEventListener("deviceready", init);
  }
});
