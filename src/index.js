import crypto from 'crypto';
import { OAuth2Strategy, InternalOAuthError } from 'passport-oauth';

import axios from 'axios';
import qs from 'qs';

/**
 * `Strategy` constructor.
 * The Instagram authentication strategy authenticates requests by delegating to Instagram using OAuth2 access tokens.
 * Applications must supply a `verify` callback which accepts a accessToken, refreshToken, profile and callback.
 * Callback supplying a `user`, which should be set to `false` if the credentials are not valid.
 * If an exception occurs, `error` should be set.
 *
 * Options:
 * - clientID          Identifies client to Instagram App
 * - clientSecret      Secret used to establish ownership of the consumer key
 * - passReqToCallback If need, pass req to verify callback
 *
 * @param {Object} _options
 * @param {Function} _verify
 * @example
 * passport.use(new InstagramTokenStrategy({
 *   clientID: '123456789',
 *   clientSecret: 'shhh-its-a-secret'
 * }), function(accessToken, refreshToken, profile, next) {
 *   User.findOrCreate({instagramId: profile.id}, function(error, user) {
 *     next(error, user);
 *   })
 * })
 */
export default class InstagramTokenStrategy extends OAuth2Strategy {
  constructor(_options, _verify) {
    let options = _options || {};
    let verify = _verify;

    options.authorizationURL = options.authorizationURL || 'https://api.instagram.com/oauth/authorize/';
    options.tokenURL = options.tokenURL || 'https://api.instagram.com/oauth/access_token';

    super(options, verify);

    this.name = 'instagram-token';
    this._codeTokenField = options.accessTokenField || 'access_token';
    this._refreshTokenField = options.refreshTokenField || 'refresh_token';
    this._profileURL = options.profileURL || 'https://graph.instagram.com/me?fields=id,username,account_type';
    this._clientSecret = options.clientSecret;
    this._clientId = options.clientID;
    this._callbackURL = options.callbackURL;
    this._enableProof = typeof options.enableProof === 'boolean' ? options.enableProof : true;
    this._passReqToCallback = options.passReqToCallback;
    this._tokenURL = options.tokenURL;
  }

  /**
   * Authenticate method
   * @param {Object} req
   * @param {Object} options
   * @returns {*}
   */
  authenticate(req, options) {
    let codeToken = (req.body && req.body[this._codeTokenField]) || (req.query && req.query[this._codeTokenField]);
    let refreshToken = (req.body && req.body[this._refreshTokenField]) || (req.query && req.query[this._refreshTokenField]);

    if (!codeToken) return this.error({message: `You should provide ${this._codeTokenField}`});

    codeToken = codeToken.replace(/\#\_$/, "");


    axios({
        method: 'post',
        url: this._tokenURL,
        data: qs.stringify({
          client_id: this._clientId,
          client_secret: this._clientSecret,
          redirect_uri: this._callbackURL,
          grant_type: 'authorization_code',
          code: codeToken
        }),
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        }
      }).then((response) => {
        let responseToken = response.data;
        let accessToken = responseToken.access_token;
        if (accessToken) {
    this._loadUserProfile(accessToken, (error, profile) => {
      if (error) return this.error(error);

      const verified = (error, user, info) => {
        if (error) return this.error(error);
        if (!user) return this.fail(info);

        return this.success(user, info);
      };

      if (this._passReqToCallback) {
        this._verify(req, accessToken, refreshToken, profile, verified);
      } else {
        this._verify(accessToken, refreshToken, profile, verified);
      }
    });
        }
        else {
          return this.error({ message: "Error getting instagram auth token" });
        }
      })
        .catch((response) => {
          return this.error({ message: "Error getting instagram auth token: " + response.response.data.error_message });
        });


    }


  /**
   * Parse user profile
   * @param {String} accessToken Instagram OAuth2 access token
   * @param {Function} done
   */
  userProfile(accessToken, done) {
    let url = this._profileURL;

    if (this._enableProof) {
      // For further details, refer to https://www.instagram.com/developer/secure-api-requests/
      let token = `/users/self|access_token=${accessToken}`;
      let proof = crypto.createHmac('sha256', this._clientSecret).update(token).digest('hex');
      url = `${url}?sig=${encodeURIComponent(proof)}`;
    }

    this._oauth2.get(url, accessToken, (error, body, res) => {
      if (error) {
        try {
          let errorJSON = JSON.parse(error.data);
          return done(new InternalOAuthError(errorJSON.meta.error_message, errorJSON.meta.code));
        } catch (_) {
          return done(new InternalOAuthError('Failed to fetch user profile', error));
        }
      }

      try {
        var json = JSON.parse(body);

        var profile = { provider: "instagram" };
        profile.id = json.id;
        profile.accountType = json.account_type;
        profile.username = json.username;

        profile._raw = body;
        profile._json = json;

        return done(null, profile);
      } catch (e) {
        return done(e);
      }
    });
  }
}
