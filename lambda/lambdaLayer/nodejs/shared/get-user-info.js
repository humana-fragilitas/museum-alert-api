/**
 * Helper to extract user information from the event's
 * requestContext authorizer claims
 */
export function getUserInfo(event) {

  let userInfo = null;

  try {
    userInfo = {
      ...event.requestContext.authorizer.claims
    };
  } catch (error) {
    console.error('Claims not found!');
  }

  return userInfo;

};