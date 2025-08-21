import {
  createRemoteJWKSet,
  jwtVerify
} from 'jose';


export async function getDecodedUserToken(reg, userPoolId, token) {

  const JWKS_URI = `https://cognito-idp.${reg}.` +
                   `amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  const jwks = createRemoteJWKSet(new URL(JWKS_URI));

  try {

    console.log(
      `[LAMBDA LAYER: getDecodedUserToken]: ` +
      `decoding user JWT token...`
    );

    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['RS256'],
    });

    return payload;
  } catch (err) {

    console.error(
      `[LAMBDA LAYER: getDecodedUserToken]: ` +
      `JWT token decoding failed:`,
      err
    );

    return null;
  }

}