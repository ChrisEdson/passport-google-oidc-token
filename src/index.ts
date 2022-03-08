import { Request } from 'express';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { Profile as PassportProfile } from 'passport';

interface StrategyOptions {
  clientID: string;
}

export interface Profile extends PassportProfile {
  id: string;
  username?: string;
  name?: {
    givenName: string;
    middleName?: string;
    familyName: string;
  };
  photos: { value: string }[];
  emails: {
    value: string;
    verified: boolean;
  }[];
  displayName: string;

  _json: any;
}

export interface StrategyOptionsWithRequest extends StrategyOptions {
  passReqToCallback: true;
}

type Info = {
  message: string;
};

type DoneCallback = (
  error: Error | null,
  user: any | undefined,
  options: Info | undefined,
) => void;

type VerifyArgs = [
  accessToken: string,
  refreshToken: string,
  profile: Profile,
  doneCallback: DoneCallback,
];

export type VerifyFunction = (...args: VerifyArgs) => void;

export type VerifyFunctionWithRequest = (
  req: Request,
  ...args: VerifyArgs
) => void;

/**
 * `GoogleOIDCTokenStrategy` constructor.
 *
 * The Google OIDC token strategy authenticates using the Google Auth Library
 *
 * Applications must supply a `verify` callback which accepts an `accessToken`,
 * `refreshToken` and service-specific `profile`, and then calls the `cb`
 * callback supplying a `user`, which should be set to `false` if the
 * credentials are not valid.  If an exception occurred, `err` should be set.
 *
 * @param {Object} options
 * @param {Function} verify
 * @example
 * passport.use(new GoogleOIDCTokenStrategy(
 *   {
 *     clientID: '123456789',
 *   },
 *   (accessToken, refreshToken, profile, cb) => {
 *     User.findOrCreate({ googleId: profile.id }, cb);
 *   }
 * );
 */
export default class GoogleOIDCTokenStrategy {
  client: OAuth2Client;
  clientId: string;
  name: string;
  _verify: VerifyFunction | VerifyFunctionWithRequest;
  _passReqToCallback: boolean;

  error: (err: Error | unknown) => void = () => {};
  fail: (info: Info | undefined) => void = () => {};
  success: (user: any, info: Info | undefined) => void = () => {};

  constructor(
    options: StrategyOptionsWithRequest,
    verify: VerifyFunctionWithRequest,
  );
  constructor(options: StrategyOptions, verify: VerifyFunction);
  constructor(
    options: StrategyOptions | StrategyOptionsWithRequest,
    verify: VerifyFunction | VerifyFunctionWithRequest,
  ) {
    this.client = new OAuth2Client(options.clientID);
    this.clientId = options.clientID;
    this.name = 'google-oidc-token';
    this._verify = verify;

    if ('passReqToCallback' in options) {
    }
    this._passReqToCallback =
      'passReqToCallback' in options ? options.passReqToCallback : false;
  }

  /**
   * Authenticate request using Google Auth Library
   * @param {Object} req
   */
  async authenticate(req: Request) {
    const idToken = this.lookup(req, 'id_token');

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId, // Specify the CLIENT_ID of the app that accesses the backend
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new Error('No payload returned');
      }

      const verifiedFunction: DoneCallback = (error, user, info) => {
        if (error) {
          return this.error(error);
        }

        if (!user) {
          return this.fail(info);
        }

        return this.success(user, info);
      };

      const accessToken = '123';
      const refreshToken = '234';

      const profile = GoogleOIDCTokenStrategy.parseProfile(payload);

      if (this._passReqToCallback) {
        (this._verify as VerifyFunctionWithRequest)(
          req,
          accessToken,
          refreshToken,
          profile,
          verifiedFunction,
        );
      } else {
        (this._verify as VerifyFunction)(
          accessToken,
          refreshToken,
          profile,
          verifiedFunction,
        );
      }
    } catch (err) {
      this.error(err);
    }
  }

  /**
   * This method handles searhing the value of provided field in body, query, and header.
   *
   * @param {Object} req http request object
   * @param {String} field
   * @returns {String} field's value in body, query, or headers
   */
  private lookup(req: Request, field: string): string {
    return (
      (req.body && req.body[field]) ||
      (req.query && req.query[field]) ||
      (req.headers && req.headers[field])
    );
  }

  /**
   * Parse profile.
   *
   * Parses user profiles as fetched from Google's OpenID Connect-compatible user
   * info endpoint.
   *
   * The amount of detail in the profile varies based on the scopes granted by the
   * user. The following scope values add additional data:
   *
   *     `profile` - basic profile information
   *     `email` - email address
   *
   * References:
   *   - https://developers.google.com/identity/protocols/OpenIDConnect
   *
   * @param {object} payload
   * @return {object}
   */
  private static parseProfile(payload: TokenPayload): Profile {
    const profile: Profile = {
      provider: 'google',
      id: payload.sub,
      displayName: payload.name || '',
      name: undefined,
      photos: [],
      emails: [],
      _json: payload,
    };

    if (payload.family_name || payload.given_name) {
      profile.name = {
        familyName: payload.family_name as string,
        givenName: payload.given_name as string,
      };
    }

    if (payload.email) {
      profile.emails = [
        {
          value: payload.email,
          verified: payload.email_verified as boolean,
        },
      ];
    }

    if (payload.picture) {
      profile.photos = [
        {
          value: payload.picture,
        },
      ];
    }

    return profile;
  }
}
