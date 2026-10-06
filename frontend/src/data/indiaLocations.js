/**
 * AgriChain — India-wide location dataset
 * =======================================
 * Static, offline-friendly State → District map for all 28 states + 8 UTs.
 *
 * Why static (not the backend location API):
 *   - This app has heavy offline support; the create-listing form must work
 *     without a network round-trip.
 *   - The backend's external location provider points at a dev endpoint.
 *
 * Shape:  { "State Name": ["District", "District", ...], ... }
 * Taluka + Village are captured as free text in the forms (talukas number in
 * the thousands across India — a dropdown for every one isn't practical).
 *
 * Helpers:
 *   INDIA_STATES        → sorted array of state names
 *   getDistricts(state) → sorted districts for a state (or [] if unknown)
 */

const INDIA_LOCATIONS = {
  "Andhra Pradesh": [
    "Anantapur", "Chittoor", "East Godavari", "Guntur", "Kadapa", "Krishna",
    "Kurnool", "Nellore", "Prakasam", "Srikakulam", "Visakhapatnam",
    "Vizianagaram", "West Godavari",
  ],
  "Arunachal Pradesh": [
    "Changlang", "East Kameng", "East Siang", "Lohit", "Lower Subansiri",
    "Papum Pare", "Tawang", "Tirap", "Upper Siang", "Upper Subansiri",
    "West Kameng", "West Siang",
  ],
  "Assam": [
    "Barpeta", "Cachar", "Darrang", "Dhemaji", "Dhubri", "Dibrugarh",
    "Goalpara", "Golaghat", "Jorhat", "Kamrup", "Karbi Anglong", "Karimganj",
    "Kokrajhar", "Lakhimpur", "Nagaon", "Nalbari", "Sivasagar", "Sonitpur",
    "Tinsukia",
  ],
  "Bihar": [
    "Araria", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur",
    "Buxar", "Darbhanga", "Gaya", "Gopalganj", "Jamui", "Jehanabad",
    "Katihar", "Khagaria", "Kishanganj", "Madhepura", "Madhubani", "Munger",
    "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas",
    "Saharsa", "Samastipur", "Saran", "Sitamarhi", "Siwan", "Vaishali",
    "West Champaran", "East Champaran",
  ],
  "Chhattisgarh": [
    "Bastar", "Bilaspur", "Dhamtari", "Durg", "Janjgir-Champa", "Jashpur",
    "Kanker", "Kabirdham", "Korba", "Koriya", "Mahasamund", "Raigarh",
    "Raipur", "Rajnandgaon", "Surguja",
  ],
  "Goa": ["North Goa", "South Goa"],
  "Gujarat": [
    "Ahmedabad", "Amreli", "Anand", "Banaskantha", "Bharuch", "Bhavnagar",
    "Dahod", "Gandhinagar", "Jamnagar", "Junagadh", "Kheda", "Kutch",
    "Mehsana", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar",
    "Rajkot", "Sabarkantha", "Surat", "Surendranagar", "Vadodara", "Valsad",
  ],
  "Haryana": [
    "Ambala", "Bhiwani", "Faridabad", "Fatehabad", "Gurugram", "Hisar",
    "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh",
    "Palwal", "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa",
    "Sonipat", "Yamunanagar",
  ],
  "Himachal Pradesh": [
    "Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu",
    "Lahaul and Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una",
  ],
  "Jharkhand": [
    "Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum",
    "Garhwa", "Giridih", "Godda", "Gumla", "Hazaribagh", "Koderma",
    "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi",
    "Sahibganj", "Seraikela Kharsawan", "Simdega", "West Singhbhum",
  ],
  "Karnataka": [
    "Bagalkot", "Bangalore", "Bangalore Rural", "Belgaum", "Bellary",
    "Bidar", "Bijapur", "Chamarajanagar", "Chikkaballapur", "Chikmagalur",
    "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag",
    "Gulbarga", "Hassan", "Haveri", "Kodagu", "Kolar", "Koppal", "Mandya",
    "Mysore", "Raichur", "Ramanagara", "Shimoga", "Tumkur", "Udupi",
    "Uttara Kannada", "Yadgir",
  ],
  "Kerala": [
    "Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam",
    "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta",
    "Thiruvananthapuram", "Thrissur", "Wayanad",
  ],
  "Madhya Pradesh": [
    "Balaghat", "Betul", "Bhind", "Bhopal", "Chhindwara", "Damoh", "Datia",
    "Dewas", "Dhar", "Guna", "Gwalior", "Hoshangabad", "Indore", "Jabalpur",
    "Katni", "Khandwa", "Khargone", "Mandsaur", "Morena", "Narsinghpur",
    "Neemuch", "Ratlam", "Rewa", "Sagar", "Satna", "Sehore", "Shivpuri",
    "Ujjain", "Vidisha",
  ],
  "Maharashtra": [
    "Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara",
    "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli",
    "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai", "Nagpur", "Nanded",
    "Nandurbar", "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune",
    "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur",
    "Thane", "Wardha", "Washim", "Yavatmal",
  ],
  "Manipur": [
    "Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West",
    "Senapati", "Tamenglong", "Thoubal", "Ukhrul",
  ],
  "Meghalaya": [
    "East Garo Hills", "East Khasi Hills", "Jaintia Hills", "Ri Bhoi",
    "South Garo Hills", "West Garo Hills", "West Khasi Hills",
  ],
  "Mizoram": [
    "Aizawl", "Champhai", "Kolasib", "Lawngtlai", "Lunglei", "Mamit",
    "Saiha", "Serchhip",
  ],
  "Nagaland": [
    "Dimapur", "Kohima", "Mokokchung", "Mon", "Phek", "Tuensang", "Wokha",
    "Zunheboto",
  ],
  "Odisha": [
    "Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Cuttack",
    "Dhenkanal", "Ganjam", "Jagatsinghpur", "Jajpur", "Jharsuguda",
    "Kalahandi", "Kendrapara", "Keonjhar", "Khordha", "Koraput", "Mayurbhanj",
    "Nabarangpur", "Nayagarh", "Puri", "Rayagada", "Sambalpur", "Sundargarh",
  ],
  "Punjab": [
    "Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib",
    "Fazilka", "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar",
    "Kapurthala", "Ludhiana", "Mansa", "Moga", "Mohali", "Muktsar",
    "Pathankot", "Patiala", "Rupnagar", "Sangrur", "Tarn Taran",
  ],
  "Rajasthan": [
    "Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara",
    "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Dholpur",
    "Dungarpur", "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", "Jhalawar",
    "Jhunjhunu", "Jodhpur", "Karauli", "Kota", "Nagaur", "Pali", "Rajsamand",
    "Sawai Madhopur", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur",
  ],
  "Sikkim": ["East Sikkim", "North Sikkim", "South Sikkim", "West Sikkim"],
  "Tamil Nadu": [
    "Ariyalur", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul",
    "Erode", "Kanchipuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai",
    "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai",
    "Ramanathapuram", "Salem", "Sivaganga", "Thanjavur", "Theni", "Thoothukudi",
    "Tiruchirappalli", "Tirunelveli", "Tiruppur", "Tiruvallur", "Tiruvannamalai",
    "Vellore", "Viluppuram", "Virudhunagar",
  ],
  "Telangana": [
    "Adilabad", "Hyderabad", "Karimnagar", "Khammam", "Mahbubnagar",
    "Medak", "Nalgonda", "Nizamabad", "Rangareddy", "Warangal",
  ],
  "Tripura": [
    "Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala",
    "South Tripura", "Unakoti", "West Tripura",
  ],
  "Uttar Pradesh": [
    "Agra", "Aligarh", "Allahabad", "Ambedkar Nagar", "Amethi", "Auraiya",
    "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda",
    "Barabanki", "Bareilly", "Basti", "Bijnor", "Budaun", "Bulandshahr",
    "Etah", "Etawah", "Faizabad", "Farrukhabad", "Fatehpur", "Firozabad",
    "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hardoi", "Jaunpur",
    "Jhansi", "Kanpur", "Kaushambi", "Lakhimpur Kheri", "Lucknow", "Mathura",
    "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit",
    "Pratapgarh", "Raebareli", "Rampur", "Saharanpur", "Sitapur", "Sultanpur",
    "Unnao", "Varanasi",
  ],
  "Uttarakhand": [
    "Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar",
    "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal",
    "Udham Singh Nagar", "Uttarkashi",
  ],
  "West Bengal": [
    "Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur",
    "Darjeeling", "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kolkata",
    "Malda", "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman",
    "Purba Bardhaman", "Paschim Medinipur", "Purba Medinipur", "Purulia",
    "South 24 Parganas", "Uttar Dinajpur",
  ],
  // ── Union Territories ──────────────────────────────────────────────────
  "Andaman and Nicobar Islands": ["Nicobar", "North and Middle Andaman", "South Andaman"],
  "Chandigarh": ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli", "Daman", "Diu"],
  "Delhi": [
    "Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi",
    "North West Delhi", "Shahdara", "South Delhi", "South West Delhi", "West Delhi",
  ],
  "Jammu and Kashmir": [
    "Anantnag", "Baramulla", "Budgam", "Doda", "Jammu", "Kathua", "Kupwara",
    "Poonch", "Pulwama", "Rajouri", "Srinagar", "Udhampur",
  ],
  "Ladakh": ["Kargil", "Leh"],
  "Lakshadweep": ["Lakshadweep"],
  "Puducherry": ["Karaikal", "Mahe", "Puducherry", "Yanam"],
};

// Sorted list of all state / UT names for the top-level dropdown.
export const INDIA_STATES = Object.keys(INDIA_LOCATIONS).sort();

// Districts for a given state (already sorted), or [] if the state is unknown.
export const getDistricts = (state) =>
  (INDIA_LOCATIONS[state] || []).slice().sort();

export default INDIA_LOCATIONS;
