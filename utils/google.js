/**
 * A module providing util functions using Google's Admin API
 * @module googleUtil
 */

const atob = require('atob');
const chai = require('chai');

const expect = chai.expect;
const { google } = require('googleapis');
const { Storage } = require('@google-cloud/storage');

const apiUtil = require('./apiUtil.js');
const files = require('./file.js');


/**
 * Internal object for managing google requests
 */
const googleApp = {
  cloudManagerConfig: {
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/iam'],
  },

  adminConfig: {
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.group',
      'https://www.googleapis.com/auth/admin.directory.group.readonly',
      'https://www.googleapis.com/auth/admin.directory.group.member',
      'https://www.googleapis.com/auth/admin.directory.group.member.readonly',
      'https://www.googleapis.com/auth/admin.directory.user.security',
    ],
    subject: 'group-admin@planx-pla.net',
  },

  get creds() {
    // written as a 'get' b/c env vars will not be set when module is loaded
    try {
      return JSON.parse(process.env.GOOGLE_APP_CREDS_JSON);
    } catch (err) {
      console.error(`ERROR: google creds not valid in GOOGLE_APP_CREDS_JSON env variable: ${process.env.GOOGLE_APP_CREDS_JSON}`, err);
      throw new Error('Invalid Google Creds');
    }
  },

  authorize({ scopes, subject }, callback) {
    const jwt = new google.auth.JWT(
      this.creds.client_email,
      null,
      this.creds.private_key,
      scopes,
      subject,
    );

    return callback(jwt);
  },

  getIAMPolicy(projectID, authClient) {
    return new Promise((resolve, reject) => {
      const cloudResourceManager = google.cloudresourcemanager('v1');
      const request = {
        resource_: projectID,
        auth: authClient,
      };

      cloudResourceManager.projects.getIamPolicy(request, (err, response) => {
        if (err) {
          console.error(err);
          reject(err);
          return;
        }
        resolve(response.data);
      });
    });
  },

  setIAMPolicy(projectID, iamPolicy, authClient) {
    return new Promise((resolve, reject) => {
      const cloudResourceManager = google.cloudresourcemanager('v1');
      const request = {
        resource_: projectID,
        resource: {
          policy: iamPolicy,
        },
        auth: authClient,
      };
      cloudResourceManager.projects.setIamPolicy(request, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(res.data);
      });
    });
  },
};

/**
 * Exported google util functions
 */
module.exports = {
  async getFileFromBucket(googleProject, pathToCredsKeyFile, bucketName, fileName) {
    // returns a https://cloud.google.com/nodejs/docs/reference/storage/2.0.x/File
    // see https://cloud.google.com/docs/authentication/production for info about
    // passing creds
    const storage = new Storage({
      projectId: googleProject,
      keyFilename: pathToCredsKeyFile,
      bucketName,
    });
    const file = storage.bucket(bucketName).file(fileName);
    return file.get()
      .then(
        (data) => {
          // Note: data[0] is the file; data[1] is the API response
          console.log(`Got file ${fileName} from bucket ${bucketName}`);
          return data[0];
        },
        (err) => {
          console.log(`Cannot get file ${fileName} from bucket ${bucketName}`, err);
          return {
            status: err.code || 403,
            message: err.message,
          };
        },
      );
  },

  /**
   * It can take some time for the user to be denied access to data.
   * This function waits and eventually returns false if the user can still
   * access data after the timeout, true otherwise
   */
  async waitForNoDataAccess(googleBucket, pathToKeyFile) {
    /**
     * return true if the user can access data, false otherwise
     */
    const isDataInaccessible = async function () {
      try {
        // Try to access data
        const user0AccessQAResAfter = await module.exports.getFileFromBucket(
          googleBucket.googleProjectId,
          pathToKeyFile,
          googleBucket.bucketId,
          googleBucket.fileName,
        );
        chai.expect(user0AccessQAResAfter).to.have.property('status', 403);
        return true;
      } catch (error) {
        console.log('Data is still accessible: rerunning');
        return false;
      }
    };
    const timeout = 60; // max number of seconds to wait
    let dataAccessIsDenied = true;
    try {
      await apiUtil.smartWait(isDataInaccessible, [], timeout, '');
    } catch (error) {
      dataAccessIsDenied = false;
    }
    return dataAccessIsDenied;
  },

  async getGroupMembers(groupKey) {
    return googleApp.authorize(googleApp.adminConfig, (authClient) => {
      // Get Google Admin API
      const admin = google.admin('directory_v1');
      admin.members.list(
        {
          groupKey,
          auth: authClient,
        },
        (err, data) => {
          if (err) {
            return { error: err.errors };
          }
          return data.data.members;
        },
      );
    });
  },

  async updateUserRole(projectID, { role, members }) {
    return googleApp.authorize(googleApp.cloudManagerConfig, authClient => googleApp.getIAMPolicy(projectID, authClient)
      .then((iamPolicy) => {
        // update the policy
        iamPolicy.bindings.push({ role, members });

        // submit the updated policy
        return googleApp.setIAMPolicy(projectID, iamPolicy, authClient);
      })
      .catch((err) => {
        console.log(err);
        return err;
      }));
  },

  async removeUserRole(projectID, { role, members }) {
    return googleApp.authorize(googleApp.cloudManagerConfig, authClient => googleApp.getIAMPolicy(projectID, authClient)
      .then((iamPolicy) => {
        // find the binding with same role
        const targetBinding = iamPolicy.bindings.find(binding => binding.role === role);
        if (!targetBinding) {
          return iamPolicy;
        }
        // remove members
        for (const member of members) {
          const memberIdx = targetBinding.members.indexOf(member);
          if (memberIdx > -1) {
            targetBinding.members.splice(memberIdx, 1);
          }
        }

        // submit the updated policy
        return googleApp.setIAMPolicy(projectID, iamPolicy, authClient);
      })
      .catch((err) => {
        console.log(err);
        return err;
      }) );
  },

  async removeAllOptionalUsers(projectID) {
    return googleApp.authorize(googleApp.cloudManagerConfig, authClient => googleApp.getIAMPolicy(projectID, authClient)
      .then((iamPolicy) => {
        const requiredRoles = [
          'roles/owner',
          'roles/resourcemanager.projectIamAdmin',
          'roles/editor',
        ];
        const bindings = iamPolicy.bindings;
        iamPolicy.bindings = bindings.filter(binding => requiredRoles.indexOf(binding.role) > -1);
        return googleApp.setIAMPolicy(projectID, iamPolicy, authClient);
      })
      .catch((err) => {
        console.log(err);
        return err;
      }) );
  },

  /**
   * @param {string} serviceAccount - name or ID of the SA to get
   * @param {string} projectID
   * @returns {object} the service account
   */
  async getServiceAccount(projectID, serviceAccount) {
    return new Promise(resolve => googleApp.authorize(googleApp.cloudManagerConfig, (authClient) => {
      const cloudResourceManager = google.iam('v1');
      const request = {
        name: `projects/${projectID}/serviceAccounts/${serviceAccount}`,
        auth: authClient,
      };
      cloudResourceManager.projects.serviceAccounts.get(request, (err, res) => {
        if (err) {
          if (err instanceof Error) {
            resolve(err);
          } else {
            resolve(Error(err));
          }
          return;
        }
        if (res && res.data) {
          resolve(res.data);
        } else {
          resolve(Error(`Unexpected get service account result: ${JSON.stringify(res)}`));
        }
      });
    }));
  },

  async createServiceAccount(projectID, serviceAccountName, description = '') {
    return new Promise(resolve => googleApp.authorize(googleApp.cloudManagerConfig, (authClient) => {
      const cloudResourceManager = google.iam('v1');
      const request = {
        resource: {
          accountId: serviceAccountName,
          serviceAccount: {
            // the API does not allow description input, so use name
            displayName: description,
          },
        },
        name: `projects/${projectID}`,
        auth: authClient,
      };
      cloudResourceManager.projects.serviceAccounts.create(request, (err, res) => {
        if (err) {
          if (err instanceof Error) {
            resolve(err);
          } else {
            resolve(Error(err));
          }
          return;
        }
        if (res && res.data) {
          resolve(res.data);
        } else {
          resolve(Error(`Unexpected create service account result: ${JSON.stringify(res)}`));
        }
      });
    }));
  },

  async deleteServiceAccount(serviceAccountID, projectID = null) {
    if (!projectID) {
      projectID = '-'; // auto get project ID from SA ID
    }
    return new Promise(resolve => googleApp.authorize(googleApp.cloudManagerConfig, (authClient) => {
      const cloudResourceManager = google.iam('v1');
      const request = {
        name: `projects/${projectID}/serviceAccounts/${serviceAccountID}`,
        auth: authClient,
      };
      cloudResourceManager.projects.serviceAccounts.delete(request, (err, res) => {
        if (err) {
          resolve(Error(err));
          return;
        }
        resolve(res.data);
      });
    }));
  },

  async listServiceAccountKeys(projectID, serviceAccountName) {
    return new Promise(resolve => googleApp.authorize(googleApp.cloudManagerConfig, (authClient) => {
      const cloudResourceManager = google.iam('v1');
      const request = {
        name: `projects/${projectID}/serviceAccounts/${serviceAccountName}`,
        auth: authClient,
      };
      cloudResourceManager.projects.serviceAccounts.keys.list(request, (err, res) => {
        if (err) {
          console.log(err);
          if (err instanceof Error) {
            resolve(Error(err.code));
          } else {
            resolve(Error(err));
          }
          return;
        }
        if (res && res.data) {
          resolve(res.data);
        } else {
          resolve(Error(`Unexpected list service account keys result: ${JSON.stringify(res)}`));
        }
      });
    }));
  },

  async createServiceAccountKey(projectID, serviceAccountName) {
    return new Promise(resolve => googleApp.authorize(googleApp.cloudManagerConfig, (authClient) => {
      const cloudResourceManager = google.iam('v1');
      const request = {
        name: `projects/${projectID}/serviceAccounts/${serviceAccountName}`,
        auth: authClient,
      };
      cloudResourceManager.projects.serviceAccounts.keys.create(request, (err, res) => {
        if (err) {
          console.log(err);
          if (err instanceof Error) {
            resolve(Error(err.code));
          } else {
            resolve(Error(err));
          }
          return;
        }
        if (res && res.data) {
          resolve(res.data);
        } else {
          resolve(Error(`Unexpected create service account key result: ${JSON.stringify(res)}`));
        }
      });
    }));
  },

  /**
   * Util function that returns the path to the file where the requested key
   * was saved and the name of that key
   */
  async createServiceAccountKeyFile(googleProject) {
    const tempCredsRes = await this.createServiceAccountKey(googleProject.id, googleProject.serviceAccountEmail);
    keyFullName = tempCredsRes.name;
    console.log(`Created key ${keyFullName}`);
    const keyData = JSON.parse(atob(tempCredsRes.privateKeyData));
    const pathToKeyFile = `${keyData.private_key_id }.json`;
    await files.createTmpFile(pathToKeyFile, JSON.stringify(keyData));
    console.log(`Google creds file ${pathToKeyFile} saved!`);
    return [pathToKeyFile, keyFullName];
  },

  async deleteServiceAccountKey(keyName) {
    return new Promise(resolve => googleApp.authorize(googleApp.cloudManagerConfig, (authClient) => {
      const cloudResourceManager = google.iam('v1');
      const request = {
        name: keyName, // "projects/X/serviceAccounts/Y/keys/Z"
        auth: authClient,
      };
      cloudResourceManager.projects.serviceAccounts.keys.delete(request, (err, res) => {
        if (err) {
          resolve(Error(err));
          return;
        }
        resolve(res.data);
      });
    }));
  },
};
