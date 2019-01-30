const homeProps = require('./homeProps.js');
const portal = require('../../../utils/portal.js');

const I = actor();

/**
 * home Questions
 */
module.exports = {
  haveAccessToken() {
    I.seeCookie('access_token');
  },

  seeDetails() {
    portal.seeProp(homeProps.summary, 5, 1);
    portal.seeProp(homeProps.cards, 5, 4);
  },

  seeUserLoggedIn(userAcct) {
    I.waitForText(userAcct.username, 5);
  }
};
