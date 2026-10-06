const axios = require("axios");
console.log("LOCATION SERVICE LOADED");

const getStates = async () => {
  const response = await axios.post(
    "https://ckandev.indiadataportal.com/api/action/datastore_search",
    {
      resource_id: "9ac39fa8-29b4-41e4-acdb-c81190a8c56f",
      limit: 100
    }
  );

  return response.data;
};
const getDistricts = async (stateCode) => {
  const response = await axios.post(
    "https://ckandev.indiadataportal.com/api/action/datastore_search",
    {
      resource_id: "19df978a-675e-4ff5-8015-d0e1de447319",
      limit: 10000,
      filters: {
        state_code: stateCode,
      },
    }
  );

  return response.data;
};

const getTalukas = async (districtCode) => {
  const response = await axios.post(
    "https://ckandev.indiadataportal.com/api/action/datastore_search",
    {
      resource_id: "42cd589e-2dc4-4f9c-a245-f201cee357e7",
      limit: 10000,
      filters: {
        district_code: districtCode,
      },
    }
  );

  return response.data;
};
console.log("getDistricts defined");
module.exports = {
  getStates,
  getDistricts,
  getTalukas,
};