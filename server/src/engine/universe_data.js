'use strict';
// Stock universe listing — real company names/tickers used as factual
// references only. Every metric derived from these entries is simulated.
// Entry: [ticker, name, exchange, sector, industry, tier, isDowMember?]
// Tiers: M = mega ($150B-3T), L = large ($10-150B), D = mid ($2-10B), S = small ($0.3-2B)

const { loadIndiaUniverseSync } = require('../market/india');

const COUNTRY_META = {
  US: { region: 'US', currency: 'USD', fx: 1 },
  IN: { region: 'IN', currency: 'INR', fx: 88 },
  GB: { region: 'UK', currency: 'GBP', fx: 0.79 },
  CA: { region: 'CA', currency: 'CAD', fx: 1.36 },
  DE: { region: 'EU', currency: 'EUR', fx: 0.92 },
  FR: { region: 'EU', currency: 'EUR', fx: 0.92 },
  NL: { region: 'EU', currency: 'EUR', fx: 0.92 },
  CH: { region: 'EU', currency: 'CHF', fx: 0.88 },
  ES: { region: 'EU', currency: 'EUR', fx: 0.92 },
  IT: { region: 'EU', currency: 'EUR', fx: 0.92 },
  JP: { region: 'APAC', currency: 'JPY', fx: 150 },
  AU: { region: 'APAC', currency: 'AUD', fx: 1.52 },
  HK: { region: 'APAC', currency: 'HKD', fx: 7.85 },
  SG: { region: 'APAC', currency: 'SGD', fx: 1.3 },
  KR: { region: 'APAC', currency: 'KRW', fx: 1350 },
  TW: { region: 'APAC', currency: 'TWD', fx: 32 },
};

// ---- United States (~156) ----

const US_LARGE = [
  // Technology
  ['AAPL', 'Apple Inc.', 'NASDAQ', 'Technology', 'Consumer Electronics', 'M', true],
  ['MSFT', 'Microsoft Corporation', 'NASDAQ', 'Technology', 'Software (Infrastructure)', 'M', true],
  ['NVDA', 'NVIDIA Corporation', 'NASDAQ', 'Technology', 'Semiconductors', 'M'],
  ['AVGO', 'Broadcom Inc.', 'NASDAQ', 'Technology', 'Semiconductors', 'M'],
  ['PLTR', 'Palantir Technologies Inc.', 'NASDAQ', 'Technology', 'Software (Application)', 'M'],
  ['ORCL', 'Oracle Corporation', 'NYSE', 'Technology', 'Software (Infrastructure)', 'L'],
  ['ADBE', 'Adobe Inc.', 'NASDAQ', 'Technology', 'Software (Application)', 'L'],
  ['CRM', 'Salesforce, Inc.', 'NYSE', 'Technology', 'Software (Application)', 'L', true],
  ['CSCO', 'Cisco Systems, Inc.', 'NASDAQ', 'Technology', 'Communication Equipment', 'L', true],
  ['INTC', 'Intel Corporation', 'NASDAQ', 'Technology', 'Semiconductors', 'L', true],
  ['IBM', 'International Business Machines Corporation', 'NYSE', 'Technology', 'IT Services', 'L', true],
  ['AMD', 'Advanced Micro Devices, Inc.', 'NASDAQ', 'Technology', 'Semiconductors', 'L'],
  ['QCOM', 'QUALCOMM Incorporated', 'NASDAQ', 'Technology', 'Semiconductors', 'L'],
  ['TXN', 'Texas Instruments Incorporated', 'NASDAQ', 'Technology', 'Semiconductors', 'L'],
  ['NOW', 'ServiceNow, Inc.', 'NYSE', 'Technology', 'Software (Application)', 'L'],
  ['AMAT', 'Applied Materials, Inc.', 'NASDAQ', 'Technology', 'Semiconductor Equipment & Materials', 'L'],
  ['LRCX', 'Lam Research Corporation', 'NASDAQ', 'Technology', 'Semiconductor Equipment & Materials', 'L'],
  ['MU', 'Micron Technology, Inc.', 'NASDAQ', 'Technology', 'Semiconductors', 'L'],
  ['ADI', 'Analog Devices, Inc.', 'NASDAQ', 'Technology', 'Semiconductors', 'L'],
  // Communication Services
  ['GOOGL', 'Alphabet Inc.', 'NASDAQ', 'Communication Services', 'Internet Content', 'M'],
  ['META', 'Meta Platforms, Inc.', 'NASDAQ', 'Communication Services', 'Internet Content', 'M'],
  ['NFLX', 'Netflix, Inc.', 'NASDAQ', 'Communication Services', 'Entertainment', 'M'],
  ['DIS', 'The Walt Disney Company', 'NYSE', 'Communication Services', 'Entertainment', 'L'],
  ['T', 'AT&T Inc.', 'NYSE', 'Communication Services', 'Telecom Services', 'L'],
  ['VZ', 'Verizon Communications Inc.', 'NYSE', 'Communication Services', 'Telecom Services', 'L'],
  ['CMCSA', 'Comcast Corporation', 'NASDAQ', 'Communication Services', 'Media', 'L'],
  ['TTWO', 'Take-Two Interactive Software, Inc.', 'NASDAQ', 'Communication Services', 'Entertainment', 'L'],
  ['RBLX', 'Roblox Corporation', 'NYSE', 'Communication Services', 'Entertainment', 'L'],
  // Consumer Cyclical
  ['AMZN', 'Amazon.com, Inc.', 'NASDAQ', 'Consumer Cyclical', 'Internet Retail', 'M'],
  ['TSLA', 'Tesla, Inc.', 'NASDAQ', 'Consumer Cyclical', 'Auto Manufacturers', 'M'],
  ['BKNG', 'Booking Holdings Inc.', 'NASDAQ', 'Consumer Cyclical', 'Travel Services', 'M'],
  ['HD', 'The Home Depot, Inc.', 'NYSE', 'Consumer Cyclical', 'Home Improvement Retail', 'L', true],
  ['MCD', "McDonald's Corporation", 'NYSE', 'Consumer Cyclical', 'Restaurants', 'L', true],
  ['NKE', 'NIKE, Inc.', 'NYSE', 'Consumer Cyclical', 'Footwear & Accessories', 'L', true],
  ['SBUX', 'Starbucks Corporation', 'NASDAQ', 'Consumer Cyclical', 'Restaurants', 'L'],
  ['LOW', "Lowe's Companies, Inc.", 'NYSE', 'Consumer Cyclical', 'Home Improvement Retail', 'L'],
  ['TJX', 'The TJX Companies, Inc.', 'NYSE', 'Consumer Cyclical', 'Apparel Retail', 'L'],
  ['ABNB', 'Airbnb, Inc.', 'NASDAQ', 'Consumer Cyclical', 'Travel Services', 'L'],
  ['LULU', 'lululemon athletica inc.', 'NASDAQ', 'Consumer Cyclical', 'Apparel Retail', 'L'],
  // Consumer Defensive
  ['WMT', 'Walmart Inc.', 'NYSE', 'Consumer Defensive', 'Discount Stores', 'M'],
  ['COST', 'Costco Wholesale Corporation', 'NASDAQ', 'Consumer Defensive', 'Discount Stores', 'M'],
  ['PG', 'The Procter & Gamble Company', 'NYSE', 'Consumer Defensive', 'Household & Personal Products', 'L', true],
  ['PEP', 'PepsiCo, Inc.', 'NASDAQ', 'Consumer Defensive', 'Beverages', 'L'],
  ['KO', 'The Coca-Cola Company', 'NYSE', 'Consumer Defensive', 'Beverages', 'L', true],
  ['MO', 'Altria Group, Inc.', 'NYSE', 'Consumer Defensive', 'Tobacco', 'L'],
  ['PM', 'Philip Morris International Inc.', 'NYSE', 'Consumer Defensive', 'Tobacco', 'L'],
  ['TGT', 'Target Corporation', 'NYSE', 'Consumer Defensive', 'Discount Stores', 'L'],
  ['CVS', 'CVS Health Corporation', 'NYSE', 'Consumer Defensive', 'Medical Distribution', 'L'],
  ['KMB', 'Kimberly-Clark Corporation', 'NASDAQ', 'Consumer Defensive', 'Household & Personal Products', 'L'],
  ['CL', 'Colgate-Palmolive Company', 'NYSE', 'Consumer Defensive', 'Household & Personal Products', 'L'],
  // Healthcare
  ['UNH', 'UnitedHealth Group Incorporated', 'NYSE', 'Healthcare', 'Medical Care Facilities', 'M', true],
  ['JNJ', 'Johnson & Johnson', 'NYSE', 'Healthcare', 'Drug Manufacturers', 'M', true],
  ['LLY', 'Eli Lilly and Company', 'NYSE', 'Healthcare', 'Drug Manufacturers', 'M', true],
  ['MRK', 'Merck & Co., Inc.', 'NYSE', 'Healthcare', 'Drug Manufacturers', 'L', true],
  ['ABBV', 'AbbVie Inc.', 'NYSE', 'Healthcare', 'Drug Manufacturers', 'L', true],
  ['AMGN', 'Amgen Inc.', 'NASDAQ', 'Healthcare', 'Biotechnology', 'L', true],
  ['PFE', 'Pfizer Inc.', 'NYSE', 'Healthcare', 'Drug Manufacturers', 'L', true],
  ['TMO', 'Thermo Fisher Scientific Inc.', 'NYSE', 'Healthcare', 'Diagnostics & Research', 'L'],
  ['ABT', 'Abbott Laboratories', 'NYSE', 'Healthcare', 'Medical Devices', 'L'],
  ['BMY', 'Bristol-Myers Squibb Company', 'NYSE', 'Healthcare', 'Drug Manufacturers', 'L'],
  ['GILD', 'Gilead Sciences, Inc.', 'NASDAQ', 'Healthcare', 'Biotechnology', 'L'],
  ['ISRG', 'Intuitive Surgical, Inc.', 'NASDAQ', 'Healthcare', 'Medical Devices', 'L'],
  ['DHR', 'Danaher Corporation', 'NYSE', 'Healthcare', 'Diagnostics & Research', 'L'],
  ['VRTX', 'Vertex Pharmaceuticals Incorporated', 'NASDAQ', 'Healthcare', 'Biotechnology', 'L'],
  // Financial Services
  ['BRK.B', 'Berkshire Hathaway Inc.', 'NYSE', 'Financial Services', 'Insurance (Diversified)', 'M', true],
  ['JPM', 'JPMorgan Chase & Co.', 'NYSE', 'Financial Services', 'Banks (Large)', 'M', true],
  ['V', 'Visa Inc.', 'NYSE', 'Financial Services', 'Credit Services', 'M'],
  ['MA', 'Mastercard Incorporated', 'NYSE', 'Financial Services', 'Credit Services', 'M'],
  ['BAC', 'Bank of America Corporation', 'NYSE', 'Financial Services', 'Banks (Large)', 'M'],
  ['WFC', 'Wells Fargo & Company', 'NYSE', 'Financial Services', 'Banks (Large)', 'M'],
  ['C', 'Citigroup Inc.', 'NYSE', 'Financial Services', 'Banks (Large)', 'M'],
  ['GS', 'The Goldman Sachs Group, Inc.', 'NYSE', 'Financial Services', 'Capital Markets', 'L', true],
  ['AXP', 'American Express Company', 'NYSE', 'Financial Services', 'Credit Services', 'L', true],
  ['TRV', 'The Travelers Companies, Inc.', 'NYSE', 'Financial Services', 'Insurance (Property & Casualty)', 'L', true],
  ['MS', 'Morgan Stanley', 'NYSE', 'Financial Services', 'Capital Markets', 'L'],
  ['BLK', 'BlackRock, Inc.', 'NYSE', 'Financial Services', 'Asset Management', 'L'],
  ['SPGI', 'S&P Global Inc.', 'NYSE', 'Financial Services', 'Financial Data & Ratings', 'L'],
  ['MRSH', 'Marsh & McLennan Companies, Inc.', 'NYSE', 'Financial Services', 'Insurance Brokers', 'L'],
  ['PNC', 'The PNC Financial Services Group, Inc.', 'NYSE', 'Financial Services', 'Banks (Regional)', 'L'],
  ['USB', 'U.S. Bancorp', 'NYSE', 'Financial Services', 'Banks (Regional)', 'L'],
  ['SCHW', 'The Charles Schwab Corporation', 'NYSE', 'Financial Services', 'Capital Markets', 'L'],
  ['PYPL', 'PayPal Holdings, Inc.', 'NASDAQ', 'Financial Services', 'Credit Services', 'L'],
  ['COIN', 'Coinbase Global, Inc.', 'NASDAQ', 'Financial Services', 'Financial Data & Ratings', 'L'],
  ['KKR', 'KKR & Co. Inc.', 'NYSE', 'Financial Services', 'Asset Management', 'L'],
  // Energy
  ['XOM', 'Exxon Mobil Corporation', 'NYSE', 'Energy', 'Oil & Gas Integrated', 'M'],
  ['CVX', 'Chevron Corporation', 'NYSE', 'Energy', 'Oil & Gas Integrated', 'M'],
  ['COP', 'ConocoPhillips', 'NYSE', 'Energy', 'Oil & Gas Exploration & Production', 'L'],
  ['SLB', 'Schlumberger Limited', 'NYSE', 'Energy', 'Oil & Gas Equipment & Services', 'L'],
  ['EOG', 'EOG Resources, Inc.', 'NYSE', 'Energy', 'Oil & Gas Exploration & Production', 'L'],
  ['OXY', 'Occidental Petroleum Corporation', 'NYSE', 'Energy', 'Oil & Gas Exploration & Production', 'L'],
  // Industrials
  ['CAT', 'Caterpillar Inc.', 'NYSE', 'Industrials', 'Farm & Heavy Machinery', 'M', true],
  ['GE', 'General Electric Company', 'NYSE', 'Industrials', 'Aerospace & Defense', 'M', true],
  ['UBER', 'Uber Technologies, Inc.', 'NYSE', 'Industrials', 'Transportation & Logistics', 'M'],
  ['HON', 'Honeywell International Inc.', 'NASDAQ', 'Industrials', 'Conglomerates', 'L', true],
  ['MMM', '3M Company', 'NYSE', 'Industrials', 'Conglomerates', 'L', true],
  ['UNP', 'Union Pacific Corporation', 'NYSE', 'Industrials', 'Railroads', 'L'],
  ['UPS', 'United Parcel Service, Inc.', 'NYSE', 'Industrials', 'Trucking', 'L', true],
  ['BA', 'The Boeing Company', 'NYSE', 'Industrials', 'Aerospace & Defense', 'L', true],
  ['RTX', 'The RTX Corporation', 'NYSE', 'Industrials', 'Aerospace & Defense', 'L', true],
  ['LMT', 'Lockheed Martin Corporation', 'NYSE', 'Industrials', 'Aerospace & Defense', 'L'],
  ['DE', 'Deere & Company', 'NYSE', 'Industrials', 'Farm & Heavy Machinery', 'L'],
  ['EMR', 'Emerson Electric Co.', 'NYSE', 'Industrials', 'Specialty Industrial Machinery', 'L'],
  ['ETN', 'Eaton Corporation plc', 'NYSE', 'Industrials', 'Specialty Industrial Machinery', 'L'],
  ['ADP', 'Automatic Data Processing, Inc.', 'NASDAQ', 'Industrials', 'Human Resources & Staffing', 'L'],
  ['GEV', 'GE Vernova Inc.', 'NYSE', 'Industrials', 'Specialty Industrial Machinery', 'L'],
  ['WM', 'Waste Management, Inc.', 'NYSE', 'Industrials', 'Waste Management', 'L'],
  // Basic Materials
  ['LIN', 'Linde plc', 'NASDAQ', 'Basic Materials', 'Chemicals', 'M'],
  ['SHW', 'The Sherwin-Williams Company', 'NYSE', 'Basic Materials', 'Paints & Coatings', 'L'],
  ['FCX', 'Freeport-McMoRan Inc.', 'NYSE', 'Basic Materials', 'Metals & Mining', 'L'],
  ['NEM', 'Newmont Corporation', 'NYSE', 'Basic Materials', 'Gold', 'L'],
  ['DOW', 'Dow Inc.', 'NYSE', 'Basic Materials', 'Chemicals', 'L', true],
  ['APD', 'Air Products and Chemicals, Inc.', 'NYSE', 'Basic Materials', 'Chemicals', 'L'],
  // Utilities
  ['NEE', 'NextEra Energy, Inc.', 'NYSE', 'Utilities', 'Electric Utilities', 'M'],
  ['DUK', 'Duke Energy Corporation', 'NYSE', 'Utilities', 'Electric Utilities', 'L'],
  ['SO', 'The Southern Company', 'NYSE', 'Utilities', 'Electric Utilities', 'L'],
  ['D', 'Dominion Energy, Inc.', 'NYSE', 'Utilities', 'Electric Utilities', 'L'],
  // Real Estate
  ['AMT', 'American Tower Corporation', 'NYSE', 'Real Estate', 'REIT — Tower', 'L'],
  ['PLD', 'Prologis, Inc.', 'NYSE', 'Real Estate', 'REIT — Industrial', 'L'],
];

const US_MID = [
  ['ETSY', 'Etsy, Inc.', 'NASDAQ', 'Consumer Cyclical', 'Internet Retail', 'D'],
  ['CHWY', 'Chewy, Inc.', 'NYSE', 'Consumer Cyclical', 'Internet Retail', 'D'],
  ['CAVA', 'CAVA Group, Inc.', 'NYSE', 'Consumer Cyclical', 'Restaurants', 'D'],
  ['EAT', 'Brinker International, Inc.', 'NYSE', 'Consumer Cyclical', 'Restaurants', 'D'],
  ['ANF', 'Abercrombie & Fitch Co.', 'NYSE', 'Consumer Cyclical', 'Apparel Retail', 'D'],
  ['AEO', 'American Eagle Outfitters, Inc.', 'NYSE', 'Consumer Cyclical', 'Apparel Retail', 'D'],
  ['W', 'Wayfair Inc.', 'NYSE', 'Consumer Cyclical', 'Internet Retail', 'D'],
  ['PVH', 'PVH Corp.', 'NYSE', 'Consumer Cyclical', 'Apparel Retail', 'D'],
  ['BBWI', 'Bath & Body Works, Inc.', 'NYSE', 'Consumer Cyclical', 'Specialty Retail', 'D'],
  ['BJ', "BJ's Wholesale Club Holdings, Inc.", 'NYSE', 'Consumer Defensive', 'Discount Stores', 'D'],
  ['FIVE', 'Five Below, Inc.', 'NASDAQ', 'Consumer Defensive', 'Discount Stores', 'D'],
  ['SOFI', 'SoFi Technologies, Inc.', 'NASDAQ', 'Financial Services', 'Consumer Finance', 'D'],
  ['UPST', 'Upstart Holdings, Inc.', 'NASDAQ', 'Financial Services', 'Consumer Finance', 'D'],
  ['AFRM', 'Affirm Holdings, Inc.', 'NASDAQ', 'Financial Services', 'Consumer Finance', 'D'],
  ['OMF', 'OneMain Holdings, Inc.', 'NYSE', 'Financial Services', 'Consumer Finance', 'D'],
  ['FHN', 'First Horizon Corporation', 'NYSE', 'Financial Services', 'Banks (Regional)', 'D'],
  ['ZION', 'Zions Bancorporation, N.A.', 'NASDAQ', 'Financial Services', 'Banks (Regional)', 'D'],
  ['KEY', 'KeyCorp', 'NYSE', 'Financial Services', 'Banks (Regional)', 'D'],
  ['CFG', 'Citizens Financial Group, Inc.', 'NYSE', 'Financial Services', 'Banks (Regional)', 'D'],
  ['ROKU', 'Roku, Inc.', 'NASDAQ', 'Communication Services', 'Entertainment', 'D'],
  ['TTD', 'The Trade Desk, Inc.', 'NASDAQ', 'Communication Services', 'Internet Content', 'D'],
  ['WBD', 'Warner Bros. Discovery, Inc.', 'NASDAQ', 'Communication Services', 'Entertainment', 'D'],
  ['ZG', 'Zillow Group, Inc.', 'NASDAQ', 'Real Estate', 'Real Estate Services', 'D'],
  ['OPEN', 'Opendoor Technologies Inc.', 'NASDAQ', 'Real Estate', 'Real Estate Services', 'D'],
  ['ENPH', 'Enphase Energy, Inc.', 'NASDAQ', 'Energy', 'Renewable Energy Equipment', 'D'],
  ['FSLR', 'First Solar, Inc.', 'NASDAQ', 'Energy', 'Renewable Energy Equipment', 'D'],
  ['SEDG', 'SolarEdge Technologies, Inc.', 'NASDAQ', 'Energy', 'Renewable Energy Equipment', 'D'],
  ['RUN', 'Sunrun Inc.', 'NASDAQ', 'Energy', 'Renewable Energy Equipment', 'D'],
  ['DXCM', 'DexCom, Inc.', 'NASDAQ', 'Healthcare', 'Medical Devices', 'D'],
  ['PEN', 'Penumbra, Inc.', 'NYSE', 'Healthcare', 'Medical Devices', 'D'],
  ['NTRA', 'Natera, Inc.', 'NASDAQ', 'Healthcare', 'Diagnostics & Research', 'D'],
  ['HIMS', 'Hims & Hers Health, Inc.', 'NYSE', 'Healthcare', 'Medical Care Facilities', 'D'],
  ['ILMN', 'Illumina, Inc.', 'NASDAQ', 'Healthcare', 'Diagnostics & Research', 'D'],
  ['TWLO', 'Twilio Inc.', 'NYSE', 'Technology', 'Software (Application)', 'D'],
  ['OKTA', 'Okta, Inc.', 'NASDAQ', 'Technology', 'Software (Application)', 'D'],
  ['U', 'Unity Software Inc.', 'NYSE', 'Technology', 'Software (Application)', 'D'],
  ['APP', 'AppLovin Corporation', 'NASDAQ', 'Technology', 'Software (Application)', 'D'],
  ['BOX', 'Box, Inc.', 'NYSE', 'Technology', 'Software (Application)', 'D'],
  ['ESTC', 'Elastic N.V.', 'NYSE', 'Technology', 'Software (Application)', 'D'],
];

// ---- India (~72) ----

const IN_LARGE = [
  ['RELIANCE', 'Reliance Industries Limited', 'NSE', 'Energy', 'Oil & Gas Integrated', 'M'],
  ['TCS', 'Tata Consultancy Services Limited', 'NSE', 'Technology', 'IT Services', 'L'],
  ['HDFCBANK', 'HDFC Bank Limited', 'NSE', 'Financial Services', 'Banks (Large)', 'L'],
  ['ICICIBANK', 'ICICI Bank Limited', 'NSE', 'Financial Services', 'Banks (Large)', 'L'],
  ['INFY', 'Infosys Limited', 'NSE', 'Technology', 'IT Services', 'L'],
  ['HINDUNILVR', 'Hindustan Unilever Limited', 'NSE', 'Consumer Defensive', 'Household & Personal Products', 'L'],
  ['ITC', 'ITC Limited', 'NSE', 'Consumer Defensive', 'Tobacco', 'L'],
  ['SBIN', 'State Bank of India', 'NSE', 'Financial Services', 'Banks (Large)', 'L'],
  ['BHARTIARTL', 'Bharti Airtel Limited', 'NSE', 'Communication Services', 'Telecom Services', 'L'],
  ['KOTAKBANK', 'Kotak Mahindra Bank Limited', 'NSE', 'Financial Services', 'Banks (Large)', 'L'],
  ['LT', 'Larsen & Toubro Limited', 'NSE', 'Industrials', 'Engineering & Construction', 'L'],
  ['AXISBANK', 'Axis Bank Limited', 'NSE', 'Financial Services', 'Banks (Large)', 'L'],
  ['ASIANPAINT', 'Asian Paints Limited', 'NSE', 'Basic Materials', 'Paints & Coatings', 'L'],
  ['MARUTI', 'Maruti Suzuki India Limited', 'NSE', 'Consumer Cyclical', 'Auto Manufacturers', 'L'],
  ['HCLTECH', 'HCL Technologies Limited', 'NSE', 'Technology', 'IT Services', 'L'],
  ['BAJFINANCE', 'Bajaj Finance Limited', 'NSE', 'Financial Services', 'Consumer Finance', 'L'],
  ['WIPRO', 'Wipro Limited', 'NSE', 'Technology', 'IT Services', 'L'],
  ['SUNPHARMA', 'Sun Pharmaceutical Industries Limited', 'NSE', 'Healthcare', 'Pharmaceuticals', 'L'],
  ['TITAN', 'Titan Company Limited', 'NSE', 'Consumer Cyclical', 'Luxury Goods', 'L'],
  ['ULTRACEMCO', 'UltraTech Cement Limited', 'NSE', 'Basic Materials', 'Cement', 'L'],
  ['NESTLEIND', 'Nestle India Limited', 'NSE', 'Consumer Defensive', 'Packaged Foods', 'L'],
  ['ONGC', 'Oil and Natural Gas Corporation Limited', 'NSE', 'Energy', 'Oil & Gas Exploration & Production', 'L'],
  ['NTPC', 'NTPC Limited', 'NSE', 'Utilities', 'Electric Utilities', 'L'],
  ['TATASTEEL', 'Tata Steel Limited', 'NSE', 'Basic Materials', 'Steel', 'L'],
  ['JSWSTEEL', 'JSW Steel Limited', 'NSE', 'Basic Materials', 'Steel', 'L'],
  ['ADANIPORTS', 'Adani Ports and Special Economic Zone Limited', 'NSE', 'Industrials', 'Integrated Shipping & Logistics', 'L'],
  ['POWERGRID', 'Power Grid Corporation of India Limited', 'NSE', 'Utilities', 'Electric Utilities', 'L'],
  ['M&M', 'Mahindra & Mahindra Limited', 'NSE', 'Consumer Cyclical', 'Auto Manufacturers', 'L'],
  ['TMPV', 'Tata Motors Passenger Vehicles Ltd.', 'NSE', 'Consumer Cyclical', 'Auto Manufacturers', 'L'],
  ['BAJAJFINSV', 'Bajaj Finserv Limited', 'NSE', 'Financial Services', 'Insurance (Diversified)', 'L'],
  ['HDFCLIFE', 'HDFC Life Insurance Company Limited', 'NSE', 'Financial Services', 'Life Insurance', 'L'],
  ['SBILIFE', 'SBI Life Insurance Company Limited', 'NSE', 'Financial Services', 'Life Insurance', 'L'],
  ['TECHM', 'Tech Mahindra Limited', 'NSE', 'Technology', 'IT Services', 'L'],
  ['CIPLA', 'Cipla Limited', 'NSE', 'Healthcare', 'Pharmaceuticals', 'L'],
  ['DRREDDY', "Dr. Reddy's Laboratories Limited", 'NSE', 'Healthcare', 'Pharmaceuticals', 'L'],
  ['APOLLOHOSP', 'Apollo Hospitals Enterprise Limited', 'NSE', 'Healthcare', 'Medical Care Facilities', 'L'],
  ['EICHERMOT', 'Eicher Motors Limited', 'NSE', 'Consumer Cyclical', 'Auto Manufacturers', 'L'],
  ['HEROMOTOCO', 'Hero MotoCorp Limited', 'NSE', 'Consumer Cyclical', 'Auto Manufacturers', 'L'],
  ['BAJAJ-AUTO', 'Bajaj Auto Limited', 'NSE', 'Consumer Cyclical', 'Auto Manufacturers', 'L'],
  ['BRITANNIA', 'Britannia Industries Limited', 'NSE', 'Consumer Defensive', 'Packaged Foods', 'L'],
  ['TATACONSUM', 'Tata Consumer Products Limited', 'NSE', 'Consumer Defensive', 'Packaged Foods', 'L'],
  ['DMART', 'Avenue Supermarts Limited', 'NSE', 'Consumer Defensive', 'Discount Stores', 'L'],
  ['HINDALCO', 'Hindalco Industries Limited', 'NSE', 'Basic Materials', 'Aluminum', 'L'],
  ['COALINDIA', 'Coal India Limited', 'NSE', 'Energy', 'Coal', 'L'],
  ['TRENT', 'Trent Limited', 'NSE', 'Consumer Cyclical', 'Apparel Retail', 'L'],
  ['DLF', 'DLF Limited', 'NSE', 'Real Estate', 'Real Estate Development', 'L'],
];

const IN_SMALL = [
  ['JUBLFOOD', 'Jubilant FoodWorks Limited', 'NSE', 'Consumer Cyclical', 'Restaurants', 'S'],
  ['DEVYANI', 'Devyani International Limited', 'NSE', 'Consumer Cyclical', 'Restaurants', 'S'],
  ['CDSL', 'Central Depository Services (India) Limited', 'NSE', 'Financial Services', 'Financial Data & Ratings', 'S'],
  ['BSE', 'BSE Limited', 'NSE', 'Financial Services', 'Financial Data & Ratings', 'S'],
  ['MCX', 'Multi Commodity Exchange of India Limited', 'NSE', 'Financial Services', 'Financial Data & Ratings', 'S'],
  ['KAYNES', 'Kaynes Technology India Limited', 'NSE', 'Technology', 'Electronic Manufacturing Services', 'S'],
  ['DIXON', 'Dixon Technologies (India) Limited', 'NSE', 'Technology', 'Electronic Manufacturing Services', 'S'],
  ['KPITTECH', 'KPIT Technologies Limited', 'NSE', 'Technology', 'Software (Application)', 'S'],
  ['MAPMYINDIA', 'C.E. Info Systems Limited', 'NSE', 'Technology', 'Software (Application)', 'S'],
  ['VOLTAS', 'Voltas Limited', 'NSE', 'Consumer Cyclical', 'Consumer Durables', 'S'],
  ['BLUESTARCO', 'Blue Star Limited', 'NSE', 'Consumer Cyclical', 'Consumer Durables', 'S'],
  ['CROMPTON', 'Crompton Greaves Consumer Electricals Limited', 'NSE', 'Consumer Cyclical', 'Consumer Durables', 'S'],
  ['CAMPUS', 'Campus Activewear Limited', 'NSE', 'Consumer Cyclical', 'Footwear & Accessories', 'S'],
  ['HONASA', 'Honasa Consumer Limited', 'NSE', 'Consumer Cyclical', 'Internet Retail', 'S'],
  ['RADICO', 'Radico Khaitan Limited', 'NSE', 'Consumer Defensive', 'Beverages', 'S'],
  ['SOLARINDS', 'Solar Industries India Limited', 'NSE', 'Industrials', 'Aerospace & Defense', 'S'],
  ['SUZLON', 'Suzlon Energy Limited', 'NSE', 'Industrials', 'Renewable Energy Equipment', 'S'],
  ['INOXWIND', 'Inox Wind Limited', 'NSE', 'Industrials', 'Renewable Energy Equipment', 'S'],
  ['AIAENG', 'AIA Engineering Limited', 'NSE', 'Industrials', 'Specialty Industrial Machinery', 'S'],
  ['FINCABLES', 'Finolex Cables Limited', 'NSE', 'Industrials', 'Electrical Equipment & Parts', 'S'],
  ['KEI', 'KEI Industries Limited', 'NSE', 'Industrials', 'Electrical Equipment & Parts', 'S'],
  ['POLYCAB', 'Polycab India Limited', 'NSE', 'Industrials', 'Electrical Equipment & Parts', 'S'],
  ['GMRAIRPORT', 'GMR Airports Limited', 'NSE', 'Industrials', 'Airlines', 'S'],
  ['METROPOLIS', 'Metropolis Healthcare Limited', 'NSE', 'Healthcare', 'Diagnostics & Research', 'S'],
  ['THYROCARE', 'Thyrocare Technologies Limited', 'NSE', 'Healthcare', 'Diagnostics & Research', 'S'],
  ['SHRIRAMFIN', 'Shriram Finance Limited', 'NSE', 'Financial Services', 'Consumer Finance', 'S'],
];

// ---- United Kingdom (26) ----

const GB_LIST = [
  ['SHEL', 'Shell plc', 'LSE', 'Energy', 'Oil & Gas Integrated', 'M'],
  ['AZN', 'AstraZeneca plc', 'LSE', 'Healthcare', 'Pharmaceuticals', 'M'],
  ['HSBA', 'HSBC Holdings plc', 'LSE', 'Financial Services', 'Banks (Global)', 'M'],
  ['ULVR', 'Unilever plc', 'LSE', 'Consumer Defensive', 'Household & Personal Products', 'L'],
  ['BATS', 'British American Tobacco p.l.c.', 'LSE', 'Consumer Defensive', 'Tobacco', 'L'],
  ['RIO', 'Rio Tinto Group', 'LSE', 'Basic Materials', 'Metals & Mining', 'L'],
  ['GSK', 'GSK plc', 'LSE', 'Healthcare', 'Pharmaceuticals', 'L'],
  ['PRU', 'Prudential plc', 'LSE', 'Financial Services', 'Life Insurance', 'L'],
  ['GLEN', 'Glencore plc', 'LSE', 'Basic Materials', 'Metals & Mining', 'L'],
  ['STAN', 'Standard Chartered plc', 'LSE', 'Financial Services', 'Banks (Global)', 'L'],
  ['LLOY', 'Lloyds Banking Group plc', 'LSE', 'Financial Services', 'Banks (Large)', 'L'],
  ['NWG', 'NatWest Group plc', 'LSE', 'Financial Services', 'Banks (Large)', 'L'],
  ['TSCO', 'Tesco plc', 'LSE', 'Consumer Defensive', 'Supermarkets', 'L'],
  ['SBRY', 'J Sainsbury plc', 'LSE', 'Consumer Defensive', 'Supermarkets', 'D'],
  ['VOD', 'Vodafone Group plc', 'LSE', 'Communication Services', 'Telecom Services', 'L'],
  ['IMB', 'Imperial Brands PLC', 'LSE', 'Consumer Defensive', 'Tobacco', 'L'],
  ['REL', 'Relx PLC', 'LSE', 'Industrials', 'Commercial Services & Supplies', 'L'],
  ['SSE', 'SSE plc', 'LSE', 'Utilities', 'Electric Utilities', 'L'],
  ['IAG', 'International Airlines Group S.A.', 'LSE', 'Industrials', 'Airlines', 'L'],
  ['LAND', 'Land Securities Group plc', 'LSE', 'Real Estate', 'REIT — Diversified', 'L'],
  ['SN', 'Smith & Nephew plc', 'LSE', 'Healthcare', 'Medical Devices', 'L'],
  ['NG', 'National Grid plc', 'LSE', 'Utilities', 'Electric Utilities', 'L'],
  ['LGEN', 'Legal & General Group plc', 'LSE', 'Financial Services', 'Life Insurance', 'L'],
  ['BRBY', 'Burberry Group plc', 'LSE', 'Consumer Cyclical', 'Luxury Goods', 'D'],
  ['EZJ', 'easyJet plc', 'LSE', 'Industrials', 'Airlines', 'D'],
];

// ---- Canada (17) ----

const CA_LIST = [
  ['SHOP', 'Shopify Inc.', 'TSX', 'Technology', 'Software (Application)', 'M'],
  ['RY', 'Royal Bank of Canada', 'TSX', 'Financial Services', 'Banks (Large)', 'M'],
  ['TD', 'The Toronto-Dominion Bank', 'TSX', 'Financial Services', 'Banks (Large)', 'M'],
  ['BNS', 'The Bank of Nova Scotia', 'TSX', 'Financial Services', 'Banks (Global)', 'L'],
  ['BMO', 'Bank of Montreal', 'TSX', 'Financial Services', 'Banks (Large)', 'L'],
  ['CM', 'The Canadian Imperial Bank of Commerce', 'TSX', 'Financial Services', 'Banks (Large)', 'L'],
  ['ENB', 'Enbridge Inc.', 'TSX', 'Energy', 'Oil & Gas Midstream', 'L'],
  ['TRP', 'TC Energy Corporation', 'TSX', 'Energy', 'Oil & Gas Midstream', 'L'],
  ['CNQ', 'Canadian Natural Resources Limited', 'TSX', 'Energy', 'Oil & Gas Exploration & Production', 'L'],
  ['SU', 'Suncor Energy Inc.', 'TSX', 'Energy', 'Oil & Gas Refining & Marketing', 'L'],
  ['BCE', 'BCE Inc.', 'TSX', 'Communication Services', 'Telecom Services', 'L'],
  ['T.TO', 'Telus Corporation', 'TSX', 'Communication Services', 'Telecom Services', 'L'],
  ['CNR', 'Canadian National Railway Company', 'TSX', 'Industrials', 'Railroads', 'L'],
  ['CP', 'Canadian Pacific Kansas City Limited', 'TSX', 'Industrials', 'Railroads', 'L'],
  ['MFC', 'Manulife Financial Corporation', 'TSX', 'Financial Services', 'Life Insurance', 'L'],
  ['SLF', 'Sun Life Financial Inc.', 'TSX', 'Financial Services', 'Life Insurance', 'L'],
  ['WCN', 'Waste Connections Inc.', 'TSX', 'Industrials', 'Waste Management', 'L'],
];

// ---- Continental Europe (33) ---- [ticker, name, exchange, sector, industry, tier, country]

const EU_LIST = [
  ['SAP', 'SAP SE', 'XETRA', 'Technology', 'Software (Application)', 'M', 'DE'],
  ['SIE', 'Siemens AG', 'XETRA', 'Industrials', 'Specialty Industrial Machinery', 'L', 'DE'],
  ['ALV', 'Allianz SE', 'XETRA', 'Financial Services', 'Insurance (Property & Casualty)', 'L', 'DE'],
  ['BMW', 'Bayerische Motoren Werke AG', 'XETRA', 'Consumer Cyclical', 'Auto Manufacturers', 'L', 'DE'],
  ['MBG', 'Mercedes-Benz Group AG', 'XETRA', 'Consumer Cyclical', 'Auto Manufacturers', 'L', 'DE'],
  ['BAS', 'BASF SE', 'XETRA', 'Basic Materials', 'Chemicals', 'L', 'DE'],
  ['DTE', 'Deutsche Telekom AG', 'XETRA', 'Communication Services', 'Telecom Services', 'L', 'DE'],
  ['RHM', 'Rheinmetall AG', 'XETRA', 'Industrials', 'Aerospace & Defense', 'L', 'DE'],
  ['IFX', 'Infineon Technologies AG', 'XETRA', 'Technology', 'Semiconductors', 'L', 'DE'],
  ['OR', "L'Oréal S.A.", 'EPA', 'Consumer Defensive', 'Household & Personal Products', 'M', 'FR'],
  ['MC', 'LVMH Moët Hennessy Louis Vuitton SE', 'EPA', 'Consumer Cyclical', 'Luxury Goods', 'M', 'FR'],
  ['TTE', 'TotalEnergies SE', 'EPA', 'Energy', 'Oil & Gas Integrated', 'M', 'FR'],
  ['SAN.PA', 'Sanofi', 'EPA', 'Healthcare', 'Pharmaceuticals', 'L', 'FR'],
  ['AIR', 'Airbus SE', 'EPA', 'Industrials', 'Aerospace & Defense', 'L', 'FR'],
  ['SU.PA', 'Schneider Electric SE', 'EPA', 'Industrials', 'Specialty Industrial Machinery', 'L', 'FR'],
  ['SAF', 'Safran SA', 'EPA', 'Industrials', 'Aerospace & Defense', 'L', 'FR'],
  ['BNP', 'BNP Paribas SA', 'EPA', 'Financial Services', 'Banks (Global)', 'L', 'FR'],
  ['CS', 'AXA SA', 'EPA', 'Financial Services', 'Insurance (Property & Casualty)', 'L', 'FR'],
  ['DG', 'Vinci SA', 'EPA', 'Industrials', 'Engineering & Construction', 'L', 'FR'],
  ['ASML', 'ASML Holding N.V.', 'AMS', 'Technology', 'Semiconductor Equipment & Materials', 'M', 'NL'],
  ['PHIA', 'Koninklijke Philips N.V.', 'AMS', 'Healthcare', 'Medical Devices', 'L', 'NL'],
  ['INGA', 'ING Groep N.V.', 'AMS', 'Financial Services', 'Banks (Global)', 'L', 'NL'],
  ['NESN', 'Nestlé S.A.', 'SWX', 'Consumer Defensive', 'Packaged Foods', 'M', 'CH'],
  ['NOVN', 'Novartis AG', 'SWX', 'Healthcare', 'Pharmaceuticals', 'M', 'CH'],
  ['ROP', 'Roche Holding AG', 'SWX', 'Healthcare', 'Diagnostics & Research', 'M', 'CH'],
  ['UBSG', 'UBS Group AG', 'SWX', 'Financial Services', 'Banks (Global)', 'L', 'CH'],
  ['ZURN', 'Zurich Insurance Group AG', 'SWX', 'Financial Services', 'Insurance (Property & Casualty)', 'L', 'CH'],
  ['ITX', 'Inditex, S.A.', 'MAD', 'Consumer Cyclical', 'Apparel Retail', 'L', 'ES'],
  ['SAN', 'Banco Santander, S.A.', 'MAD', 'Financial Services', 'Banks (Global)', 'L', 'ES'],
  ['IBE', 'Iberdrola, S.A.', 'MAD', 'Utilities', 'Electric Utilities', 'L', 'ES'],
  ['ENI', 'Eni S.p.A.', 'MIL', 'Energy', 'Oil & Gas Integrated', 'L', 'IT'],
  ['ENEL', 'Enel S.p.A.', 'MIL', 'Utilities', 'Electric Utilities', 'L', 'IT'],
  ['ISP', 'Intesa Sanpaolo S.p.A.', 'MIL', 'Financial Services', 'Banks (Large)', 'L', 'IT'],
];

// ---- Asia-Pacific (23) ---- [ticker, name, exchange, sector, industry, tier, country]

const APAC_LIST = [
  ['7203', 'Toyota Motor Corporation', 'TSE', 'Consumer Cyclical', 'Auto Manufacturers', 'M', 'JP'],
  ['6758', 'Sony Group Corporation', 'TSE', 'Consumer Cyclical', 'Consumer Electronics', 'L', 'JP'],
  ['6861', 'Keyence Corporation', 'TSE', 'Technology', 'Electronic Equipment & Instruments', 'L', 'JP'],
  ['8306', 'Mitsubishi UFJ Financial Group, Inc.', 'TSE', 'Financial Services', 'Banks (Global)', 'M', 'JP'],
  ['9432', 'Nippon Telegraph and Telephone Corporation', 'TSE', 'Communication Services', 'Telecom Services', 'L', 'JP'],
  ['6501', 'Hitachi, Ltd.', 'TSE', 'Industrials', 'Conglomerates', 'L', 'JP'],
  ['6954', 'FANUC Corporation', 'TSE', 'Industrials', 'Specialty Industrial Machinery', 'L', 'JP'],
  ['7974', 'Nintendo Co., Ltd.', 'TSE', 'Communication Services', 'Entertainment', 'L', 'JP'],
  ['BHP', 'BHP Group Limited', 'ASX', 'Basic Materials', 'Metals & Mining', 'L', 'AU'],
  ['CBA', 'Commonwealth Bank of Australia', 'ASX', 'Financial Services', 'Banks (Large)', 'L', 'AU'],
  ['CSL', 'CSL Limited', 'ASX', 'Healthcare', 'Biotechnology', 'L', 'AU'],
  ['WES', 'Wesfarmers Limited', 'ASX', 'Industrials', 'Conglomerates', 'L', 'AU'],
  ['FMG', 'Fortescue Ltd.', 'ASX', 'Basic Materials', 'Metals & Mining', 'L', 'AU'],
  ['TLS', 'Telstra Group Limited', 'ASX', 'Communication Services', 'Telecom Services', 'L', 'AU'],
  ['0700', 'Tencent Holdings Limited', 'HKEX', 'Communication Services', 'Internet Content', 'M', 'HK'],
  ['9988', 'Alibaba Group Holding Limited', 'HKEX', 'Consumer Cyclical', 'Internet Retail', 'M', 'HK'],
  ['1211', 'BYD Company Limited', 'HKEX', 'Consumer Cyclical', 'Auto Manufacturers', 'L', 'HK'],
  ['1810', 'Xiaomi Corporation', 'HKEX', 'Technology', 'Consumer Electronics', 'L', 'HK'],
  ['9888', 'Baidu, Inc.', 'HKEX', 'Communication Services', 'Internet Content', 'L', 'HK'],
  ['D05', 'DBS Group Holdings Ltd.', 'SGX', 'Financial Services', 'Banks (Large)', 'L', 'SG'],
  ['005930', 'Samsung Electronics Co., Ltd.', 'KRX', 'Technology', 'Semiconductors', 'M', 'KR'],
  ['000660', 'SK Hynix Inc.', 'KRX', 'Technology', 'Semiconductors', 'L', 'KR'],
  ['2330', 'Taiwan Semiconductor Manufacturing Company Limited', 'TWSE', 'Technology', 'Semiconductors', 'M', 'TW'],
];

function rawEntries() {
  const out = [];
  const push = (country, list) => {
    for (const e of list) {
      out.push({
        country,
        ticker: e[0], name: e[1], exchange: e[2],
        sector: e[3], industry: e[4], tier: e[5],
        dow: e[6] === true,
      });
    }
  };
  push('US', US_LARGE);
  push('US', US_MID);
  push('IN', IN_LARGE);
  push('IN', IN_SMALL);
  push('GB', GB_LIST);
  push('CA', CA_LIST);
  for (const e of EU_LIST) {
    out.push({
      country: e[6], ticker: e[0], name: e[1], exchange: e[2],
      sector: e[3], industry: e[4], tier: e[5], dow: false,
    });
  }
  for (const e of APAC_LIST) {
    out.push({
      country: e[6], ticker: e[0], name: e[1], exchange: e[2],
      sector: e[3], industry: e[4], tier: e[5], dow: false,
    });
  }
  // Expand with the full NSE listing so every Indian market stock is present.
  // These entries are flagged `expanded` — the curated AI-pick strategies
  // exclude them (they keep their hand-picked pools) while the screener,
  // search, watchlist and stock pages serve them with real live data once the
  // overlay resolves + quotes them. Dedupe against the curated Indian names.
  const seen = new Set(out.map((e) => `${e.country}:${e.ticker}`));
  const india = loadIndiaUniverseSync();
  if (india && Array.isArray(india.rows)) {
    for (const r of india.rows) {
      if (!r || !r.ticker) continue;
      if (seen.has(`IN:${r.ticker}`)) continue;
      seen.add(`IN:${r.ticker}`);
      out.push({
        country: 'IN', ticker: r.ticker, name: r.name,
        exchange: r.exchange || 'NSE', sector: r.sector || 'Industrials',
        industry: r.industry || 'Unknown', tier: 'S', dow: false,
        expanded: true,
      });
    }
  }
  return out;
}

module.exports = { COUNTRY_META, rawEntries };
