Feature('Login');

const chai = require('chai');
const {interactive, ifInteractive} = require('../../utils/interactive.js');
const expect = chai.expect;

Scenario('login @portal', (home) => {
  home.do.goToHomepage();
  home.complete.login();
  home.ask.seeDetails();
  home.complete.logout();
});

/*
Data Setup:
    1. User_1 - Synapse account having access to a project in a brain commons (Commons_1)
*/
//User story https://ctds-planx.atlassian.net/browse/PXP-4777
Scenario('Synapse Digital ID is shown as the username in brain commons @manual', ifInteractive(
    async (I) => {
      const result = await interactive(`
            1. Log in to Commons_1 (brain commons) (e.g. https://qa-brain.planx-pla.net) as User_1 (synapse account)
            2. Verify that the username shown on home page is the Synapse Digital ID
        `);
      expect(result.didPass, result.details).to, be.true;
    }
));