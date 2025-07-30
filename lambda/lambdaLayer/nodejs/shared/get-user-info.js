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