const axios = require('axios');
const { API_URL, API_KEY, APP_NAME, APP_VERSION } = require('../config/constants');

module.exports = {
  fetchRevision: async (slug, revision) => {
    const query = `
      query Revision($slug: String!, $revision: Int) {
        collectionRevision(slug: $slug, revision: $revision, viewAdultContent: true) {
          revisionNumber
          modFiles {
            fileId
            optional
            file {
              fileId
              name
              version
              mod {
                modId
                name
                game {
                  name
                  domainName
                }
              }
            }
          }
        }
      }
    `;
    
    const variables = { slug, revision };
    const headers = {
      'Content-Type': 'application/json',
      apikey: API_KEY,
      'Application-Name': APP_NAME,
      'Application-Version': APP_VERSION,
    };

    try {
      const response = await axios.post(API_URL, { query, variables }, { headers, timeout: 10000 });
      
      if (response.data.errors) {
        const errorMessage = response.data.errors.map(error => error.message).join(', ');
        throw new Error(`API Error: ${errorMessage}`);
      }
      
      if (!response.data.data?.collectionRevision) {
        throw new Error(`Revision ${revision} not found for collection ${slug}`);
      }
      
      return response.data.data.collectionRevision;
    } catch (error) {
      if (error.response) {
        throw new Error(`API returned status ${error.response.status}: ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error('No response received from Nexus Mods API. Please try again later.');
      } else {
        throw new Error(`Failed to fetch revision: ${error.message}`);
      }
    }
  }
};