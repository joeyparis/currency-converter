// Currency Converter PWA
// Constants and Configuration
const DEVICE_LOCALE = navigator.language || 'en-US';

// Exchange Rate Providers Configuration
const PROVIDERS = {
  frankfurter: {
    name: 'Frankfurter',
    description: 'Free service with 31 major currencies',
    apiBase: 'https://api.frankfurter.app',
    requiresApiKey: false,
    currenciesEndpoint: '/currencies',
    ratesEndpoint: '/latest',
    maxCurrencies: 31
  },
  unirateapi: {
    name: 'UniRateAPI', 
    description: 'Premium service with 170+ currencies',
    apiBase: 'https://api.unirateapi.com/api',
    requiresApiKey: true,
    currenciesEndpoint: '/currencies',
    ratesEndpoint: '/rates',
    maxCurrencies: 170
  }
};

// Current provider state
let currentProvider = 'frankfurter';
let apiKey = null;

// Currency to locale mappings for proper formatting
const DEFAULT_LOCALE_BY_CURRENCY = {
  'COP': 'es-CO',
  'USD': 'en-US',
  'EUR': 'de-DE',
  'GBP': 'en-GB',
  'JPY': 'ja-JP',
  'CAD': 'en-CA',
  'AUD': 'en-AU',
  'BRL': 'pt-BR',
  'MXN': 'es-MX',
  'CNY': 'zh-CN',
  'KRW': 'ko-KR',
  'INR': 'hi-IN',
  'CHF': 'de-CH',
  'SEK': 'sv-SE',
  'NOK': 'nb-NO',
  'DKK': 'da-DK',
  'PLN': 'pl-PL',
  'CZK': 'cs-CZ',
  'HUF': 'hu-HU',
  'RON': 'ro-RO',
  'BGN': 'bg-BG',
  'TRY': 'tr-TR',
  'RUB': 'ru-RU',
  'HRK': 'hr-HR',
  'ISK': 'is-IS',
  'ZAR': 'af-ZA',
  'NZD': 'en-NZ',
  'SGD': 'en-SG',
  'HKD': 'zh-HK',
  'THB': 'th-TH',
  'MYR': 'ms-MY',
  'IDR': 'id-ID',
  'PHP': 'en-PH',
  'ILS': 'he-IL'
};

// Global state
let fromCurrency = 'USD';
let toCurrency = 'USD';
let currentRate = null;
let isUpdatingProgrammatically = false;
let debounceTimer = null;
let deferredPrompt = null;

// IndexedDB Storage Layer (better persistence on iOS than localStorage)
class PersistentStorage {
  constructor() {
    this.dbName = 'CurrencyConverterDB';
    this.dbVersion = 1;
    this.db = null;
  }
  
  async init() {
    if (this.db) return this.db;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => {
        console.warn('IndexedDB failed to open, falling back to localStorage');
        resolve(null); // Fall back to localStorage
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('IndexedDB initialized successfully');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('currencies')) {
          db.createObjectStore('currencies', { keyPath: 'provider' });
        }
        
        if (!db.objectStoreNames.contains('rates')) {
          db.createObjectStore('rates', { keyPath: 'key' });
        }
        
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }
  
  async set(store, key, data) {
    try {
      await this.init();
      
      if (!this.db) {
        // Fallback to localStorage
        localStorage.setItem(key, JSON.stringify(data));
        return;
      }
      
      const transaction = this.db.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      
      const record = typeof data === 'object' && data !== null ? 
        { ...data, key } : { key, data };
      
      await new Promise((resolve, reject) => {
        const request = objectStore.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      
    } catch (error) {
      console.warn('IndexedDB write failed, using localStorage:', error);
      localStorage.setItem(key, JSON.stringify(data));
    }
  }
  
  async get(store, key) {
    try {
      await this.init();
      
      if (!this.db) {
        // Fallback to localStorage
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      }
      
      const transaction = this.db.transaction([store], 'readonly');
      const objectStore = transaction.objectStore(store);
      
      return new Promise((resolve, reject) => {
        const request = objectStore.get(key);
        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? (result.data || result) : null);
        };
        request.onerror = () => reject(request.error);
      });
      
    } catch (error) {
      console.warn('IndexedDB read failed, using localStorage:', error);
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    }
  }
  
  async remove(store, key) {
    try {
      await this.init();
      
      if (!this.db) {
        localStorage.removeItem(key);
        return;
      }
      
      const transaction = this.db.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      
      await new Promise((resolve, reject) => {
        const request = objectStore.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      
    } catch (error) {
      console.warn('IndexedDB delete failed, using localStorage:', error);
      localStorage.removeItem(key);
    }
  }
}

// Global persistent storage instance
const persistentStorage = new PersistentStorage();

// Utility Functions
function currencyFractionDigits(currency) {
  try {
    const nf = new Intl.NumberFormat('en', { style: 'currency', currency });
    const opts = nf.resolvedOptions();
    return Math.max(opts.minimumFractionDigits || 0, opts.maximumFractionDigits || 0);
  } catch (e) {
    // Fallback for unsupported currencies
    return 2;
  }
}

function formatCurrencyNumber(value, locale, currency) {
  try {
    const digits = currencyFractionDigits(currency);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(value);
  } catch (e) {
    // Fallback formatting
    return `${value.toFixed(2)} ${currency}`;
  }
}

function getLocaleForCurrency(currency) {
  return DEFAULT_LOCALE_BY_CURRENCY[currency] || DEVICE_LOCALE;
}

function debounce(func, delay) {
  return function(...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(this, args), delay);
  };
}

// Provider Management Functions
function getProviderConfig() {
  return PROVIDERS[currentProvider];
}

async function loadApiKey() {
  try {
    const stored = await persistentStorage.get('settings', `api-key-${currentProvider}`);
    return stored ? stored.data || stored : null;
  } catch (error) {
    // Fallback to localStorage
    const stored = localStorage.getItem(`api-key-${currentProvider}`);
    return stored ? stored : null;
  }
}

async function saveApiKey(key) {
  if (key && key.trim()) {
    try {
      await persistentStorage.set('settings', `api-key-${currentProvider}`, key.trim());
      apiKey = key.trim();
      return true;
    } catch (error) {
      // Fallback to localStorage
      localStorage.setItem(`api-key-${currentProvider}`, key.trim());
      apiKey = key.trim();
      return true;
    }
  }
  return false;
}

async function clearApiKey() {
  try {
    await persistentStorage.remove('settings', `api-key-${currentProvider}`);
  } catch (error) {
    localStorage.removeItem(`api-key-${currentProvider}`);
  }
  apiKey = null;
}

// Currency selection persistence functions
function saveCurrencySelection() {
  try {
    localStorage.setItem('selected-currencies', JSON.stringify({
      from: fromCurrency,
      to: toCurrency,
      savedAt: Date.now()
    }));
  } catch (e) {
    console.warn('Failed to save currency selection:', e);
  }
}

function loadCurrencySelection() {
  try {
    const saved = localStorage.getItem('selected-currencies');
    if (saved) {
      const data = JSON.parse(saved);
      // Use saved currencies if they exist and were saved within last 30 days
      if (data.from && data.to && (Date.now() - data.savedAt) < 30 * 24 * 60 * 60 * 1000) {
        return { from: data.from, to: data.to };
      }
    }
  } catch (e) {
    console.warn('Failed to load currency selection:', e);
  }
  return null;
}

// Amount values persistence functions
function saveAmountValues() {
  try {
    const fromAmount = fromMask ? fromMask.getNumber() : 0;
    const toAmount = toMask ? toMask.getNumber() : 0;
    
    localStorage.setItem('saved-amounts', JSON.stringify({
      fromAmount,
      toAmount,
      savedAt: Date.now()
    }));
  } catch (e) {
    console.warn('Failed to save amount values:', e);
  }
}

function loadAmountValues() {
  try {
    const saved = localStorage.getItem('saved-amounts');
    if (saved) {
      const data = JSON.parse(saved);
      // Use saved amounts if they exist and were saved within last 24 hours
      if ((data.fromAmount || data.toAmount) && (Date.now() - data.savedAt) < 24 * 60 * 60 * 1000) {
        return {
          fromAmount: data.fromAmount || 0,
          toAmount: data.toAmount || 0
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load amount values:', e);
  }
  return null;
}

function buildApiHeaders() {
  const provider = getProviderConfig();
  const headers = {
    'Content-Type': 'application/json'
  };
  
  // UniRateAPI uses query parameters, not headers for API key
  // So we don't add the API key to headers
  
  return headers;
}

function buildApiUrl(endpoint, params = {}) {
  const provider = getProviderConfig();
  let url = provider.apiBase + endpoint;
  
  // Add API key as query parameter for UniRateAPI
  if (provider.requiresApiKey && apiKey) {
    params.api_key = apiKey;
  }
  
  const queryString = Object.keys(params).length > 0 ? 
    '?' + new URLSearchParams(params).toString() : '';
  
  return url + queryString;
}

// Get locale-specific decimal separator
function getDecimalSeparator(locale) {
  try {
    const formatter = new Intl.NumberFormat(locale);
    const parts = formatter.formatToParts(1.1);
    const decimalPart = parts.find(part => part.type === 'decimal');
    return decimalPart ? decimalPart.value : '.';
  } catch (e) {
    return '.';
  }
}

// Get locale-specific thousands separator
function getThousandsSeparator(locale) {
  try {
    const formatter = new Intl.NumberFormat(locale);
    const parts = formatter.formatToParts(1000);
    const groupPart = parts.find(part => part.type === 'group');
    return groupPart ? groupPart.value : ',';
  } catch (e) {
    return ',';
  }
}

// Parse locale-formatted number string to actual number
function parseLocaleNumber(str, locale) {
  if (!str) return 0;
  
  const decimalSep = getDecimalSeparator(locale);
  const thousandsSep = getThousandsSeparator(locale);
  
  // Remove thousands separators and replace decimal separator with dot
  const cleanStr = str
    .replace(new RegExp('\\' + thousandsSep, 'g'), '')
    .replace(new RegExp('\\' + decimalSep, 'g'), '.');
  
  return parseFloat(cleanStr) || 0;
}

// Format number according to locale with thousands separators
function formatLocaleNumber(num, locale, maxDecimals = 2) {
  if (num === 0 || num === null || num === undefined) return '';
  
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
      useGrouping: true // Use thousands separators for better readability
    }).format(num);
  } catch (e) {
    return num.toString();
  }
}

// Internationalized Currency Input
function createCurrencyInput(inputEl, initialCurrency, initialLocale) {
  let currency = initialCurrency;
  let locale = initialLocale;
  let isUpdating = false;
  let lastValidValue = '';

  // Convert input to text type for better control
  inputEl.type = 'text';
  inputEl.inputMode = 'decimal';
  
  // Set locale-specific placeholder with thousands separator example
  const exampleNumber = 1234.56;
  inputEl.placeholder = formatLocaleNumber(exampleNumber, locale);

  function handleInput() {
    if (isUpdating) return;
    
    const inputValue = inputEl.value;
    const numValue = parseLocaleNumber(inputValue, locale);
    
    // Only update if we have a valid number
    if (!isNaN(numValue)) {
      lastValidValue = inputValue;
      
      // Auto-format with thousands separators while typing (with debounce)
      clearTimeout(inputEl.formatTimer);
      inputEl.formatTimer = setTimeout(() => {
        if (!isUpdating && document.activeElement === inputEl) {
          const cursorPos = inputEl.selectionStart;
          const oldLength = inputEl.value.length;
          const formatted = formatLocaleNumber(numValue, locale);
          
          if (formatted !== inputEl.value) {
            isUpdating = true;
            inputEl.value = formatted;
            // Adjust cursor position after formatting
            const newLength = inputEl.value.length;
            const newPos = cursorPos + (newLength - oldLength);
            inputEl.setSelectionRange(newPos, newPos);
            isUpdating = false;
          }
        }
      }, 500); // Format after 500ms of no typing
      
      inputEl.dispatchEvent(new CustomEvent('masked-change', {
        bubbles: true,
        detail: { number: numValue }
      }));
    }
  }

  function handleBlur() {
    if (isUpdating) return;
    
    const numValue = parseLocaleNumber(inputEl.value, locale);
    if (!isNaN(numValue) && numValue !== 0) {
      isUpdating = true;
      inputEl.value = formatLocaleNumber(numValue, locale);
      isUpdating = false;
    }
  }

  inputEl.addEventListener('input', handleInput);
  inputEl.addEventListener('blur', handleBlur);
  inputEl.addEventListener('keydown', (e) => {
    // Allow Enter to move to next field
    if (e.key === 'Enter') {
      const nextField = inputEl.id === 'from-amount' ? 
        document.getElementById('to-amount') : 
        document.getElementById('from-amount');
      if (nextField) nextField.focus();
    }
    
    // Allow standard navigation and editing keys
    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      return;
    }
    
    // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if (e.ctrlKey || e.metaKey) {
      return;
    }
    
    // Allow digits
    if (e.key >= '0' && e.key <= '9') {
      return;
    }
    
    // Allow locale-specific decimal separator
    const decimalSep = getDecimalSeparator(locale);
    if (e.key === decimalSep && !inputEl.value.includes(decimalSep)) {
      return;
    }
    
    // Allow thousands separator
    const thousandsSep = getThousandsSeparator(locale);
    if (e.key === thousandsSep) {
      return;
    }
    
    // Block invalid characters
    e.preventDefault();
  });

  return {
    setCurrency(nextCurrency, nextLocale) {
      currency = nextCurrency;
      if (nextLocale !== locale) {
        locale = nextLocale;
        // Update placeholder for new locale
        const exampleNumber = 1234.56;
        inputEl.placeholder = formatLocaleNumber(exampleNumber, locale);
        
        // Reformat current value for new locale
        const currentNum = this.getNumber();
        if (currentNum !== 0) {
          this.setNumber(currentNum);
        }
      }
    },
    setNumber(n) { 
      if (isUpdating) return;
      isUpdating = true;
      if (n === 0 || n === null || n === undefined) {
        inputEl.value = '';
      } else {
        inputEl.value = formatLocaleNumber(n, locale);
      }
      isUpdating = false;
    },
    getNumber() { 
      return parseLocaleNumber(inputEl.value, locale);
    }
  };
}

// API Functions
async function loadCurrencies() {
  const provider = getProviderConfig();
  const key = `currencies-cache-${currentProvider}`;
  
  // Check if provider requires API key but none is available
  if (provider.requiresApiKey && !apiKey) {
    try {
      const cached = await persistentStorage.get('currencies', key);
      if (cached && cached.data) {
        return cached.data;
      }
    } catch (error) {
      // Fallback to localStorage
      const cached = localStorage.getItem(key);
      if (cached) {
        const cachedData = JSON.parse(cached);
        return cachedData.data;
      }
    }
    throw new Error('API key required for this provider');
  }
  
  try {
    const url = buildApiUrl(provider.currenciesEndpoint);
    const headers = buildApiHeaders();
    
    const res = await fetch(url, { 
      cache: 'no-store',
      headers: headers
    });
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Invalid API key');
      }
      throw new Error(`Network error: ${res.status}`);
    }
    
    const responseData = await res.json();
    
    // Handle different response formats
    let currencies;
    if (currentProvider === 'frankfurter') {
      currencies = responseData; // Direct object format: {"USD": "United States Dollar"}
    } else if (currentProvider === 'unirateapi') {
      // UniRateAPI returns different format - check what we actually get
      console.log('UniRateAPI currencies response:', responseData);
      
      currencies = {};
      
      if (Array.isArray(responseData)) {
        // If it's an array of currency codes ["USD", "EUR", ...]
        responseData.forEach(code => {
          if (typeof code === 'string' && code.length === 3) {
            currencies[code] = code; // Use 3-letter code as both key and display
          }
        });
      } else if (responseData.currencies) {
        // If nested in currencies property
        const currencyData = responseData.currencies;
        if (Array.isArray(currencyData)) {
          currencyData.forEach(code => {
            if (typeof code === 'string' && code.length === 3) {
              currencies[code] = code;
            }
          });
        } else {
          // If it's an object, extract the currency codes from keys or values
          Object.entries(currencyData).forEach(([key, value]) => {
            // Use the 3-letter code, whether it's the key or value
            const code = (typeof key === 'string' && key.length === 3) ? key : 
                        (typeof value === 'string' && value.length === 3) ? value : null;
            if (code) {
              currencies[code] = code;
            }
          });
        }
      } else if (responseData.data) {
        // Similar handling for data property
        const currencyData = responseData.data;
        if (Array.isArray(currencyData)) {
          currencyData.forEach(code => {
            if (typeof code === 'string' && code.length === 3) {
              currencies[code] = code;
            }
          });
        }
      } else {
        // Direct object - extract currency codes from keys or values
        Object.entries(responseData).forEach(([key, value]) => {
          const code = (typeof key === 'string' && key.length === 3) ? key : 
                      (typeof value === 'string' && value.length === 3) ? value : null;
          if (code) {
            currencies[code] = code;
          }
        });
      }
      
      console.log('Parsed UniRateAPI currencies:', currencies);
    }
    
    const cacheData = { 
      provider: currentProvider,
      data: currencies, 
      fetchedAt: Date.now() 
    };
    
    // Store in IndexedDB with localStorage fallback
    try {
      await persistentStorage.set('currencies', key, cacheData);
    } catch (error) {
      // Fallback to localStorage
      localStorage.setItem(key, JSON.stringify(cacheData));
    }
    
    return currencies;
  } catch (e) {
    console.error('Failed to load currencies:', e.message);
    console.error('Provider:', currentProvider, 'API Key present:', !!apiKey);
    
    // Try IndexedDB first, then localStorage fallback
    try {
      const cached = await persistentStorage.get('currencies', key);
      if (cached && cached.data) {
        console.log('Using cached currencies from IndexedDB:', cached.data);
        return cached.data;
      }
    } catch (error) {
      const cached = localStorage.getItem(key);
      if (cached) {
        const cachedData = JSON.parse(cached);
        console.log('Using cached currencies from localStorage:', cachedData.data);
        return cachedData.data;
      }
    }
    throw e;
  }
}

async function getRate(from, to) {
  if (from === to) {
    return { 
      rate: 1, 
      apiDate: new Date().toISOString().slice(0, 10), 
      fetchedAt: Date.now(), 
      source: 'synthetic' 
    };
  }
  
  const provider = getProviderConfig();
  const key = `rate:${currentProvider}:${from}:${to}`;
  
  // Check if provider requires API key but none is available
  if (provider.requiresApiKey && !apiKey) {
    try {
      const cached = await persistentStorage.get('rates', key);
      if (cached) {
        return { ...cached, source: 'cache' };
      }
    } catch (error) {
      // Fallback to localStorage
      const cached = localStorage.getItem(key);
      if (cached) {
        const record = JSON.parse(cached);
        return { ...record, source: 'cache' };
      }
    }
    throw new Error('API key required for this provider');
  }
  
  try {
    let url, params = {};
    
    if (currentProvider === 'frankfurter') {
      params = { from, to, amount: '1' };
      url = buildApiUrl(provider.ratesEndpoint, params);
    } else if (currentProvider === 'unirateapi') {
      // UniRateAPI uses /api/rates with from and to parameters
      params = { from, to };
      url = buildApiUrl('/rates', params); // Use /rates instead of provider.ratesEndpoint
    }
    
    const headers = buildApiHeaders();
    
    const res = await fetch(url, { 
      cache: 'no-store',
      headers: headers
    });
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Invalid API key');
      }
      throw new Error(`Network error: ${res.status}`);
    }
    
    const json = await res.json();
    let rate, apiDate;
    
    console.log(`${currentProvider} rates response:`, json);
    
    if (currentProvider === 'frankfurter') {
      rate = json.rates[to];
      apiDate = json.date;
    } else if (currentProvider === 'unirateapi') {
      // UniRateAPI /api/rates response format
      if (json.rates && json.rates[to]) {
        rate = json.rates[to];
      } else if (json[to]) {
        rate = json[to];
      } else if (json.rate) {
        rate = json.rate; // Some APIs return a single rate value
      } else if (json.result && json.result[to]) {
        rate = json.result[to];
      }
      
      // Try to get date from various possible fields
      apiDate = json.date || json.updated || json.timestamp || new Date().toISOString().slice(0, 10);
      
      console.log('Extracted rate:', rate, 'date:', apiDate);
    }
    
    if (!rate) {
      throw new Error(`Rate not found for ${from} to ${to}`);
    }
    
    const record = { key, rate, apiDate, fetchedAt: Date.now() };
    
    // Store in IndexedDB with localStorage fallback
    try {
      await persistentStorage.set('rates', key, record);
    } catch (error) {
      // Fallback to localStorage
      localStorage.setItem(key, JSON.stringify(record));
    }
    
    return { ...record, source: 'network' };
    
  } catch (err) {
    console.error('Failed to get rate:', err.message);
    
    // Try IndexedDB first, then localStorage fallback
    try {
      const cached = await persistentStorage.get('rates', key);
      if (cached) {
        return { ...cached, source: 'cache' };
      }
    } catch (error) {
      const cached = localStorage.getItem(key);
      if (cached) {
        const record = JSON.parse(cached);
        return { ...record, source: 'cache' };
      }
    }
    throw err;
  }
}

// DOM Elements
let fromAmountInput, toAmountInput, fromCurrencySelect, toCurrencySelect;
let swapButton, rateLine, updatedLine, errorArea, errorMessage, retryButton;
let offlineBanner, staleBanner, installButton;
let providerSelect, apiKeySection, apiKeyInput, toggleApiKeyButton, saveSettingsButton, forceRefreshButton;
let fromMask, toMask;

// UI Update Functions
function populateCurrencySelects(currencies) {
  console.log('Populating currency selects with:', currencies);
  
  const sortedCurrencies = Object.entries(currencies).sort(([a], [b]) => a.localeCompare(b));
  
  // Clear existing options
  fromCurrencySelect.innerHTML = '';
  toCurrencySelect.innerHTML = '';
  
  // Add options to both selects - always show just the currency code
  sortedCurrencies.forEach(([code, name]) => {
    const fromOption = new Option(code, code); // Display code, value is code
    const toOption = new Option(code, code);
    
    // Add the full name as title for tooltips (if available)
    if (name && name !== code) {
      fromOption.title = name;
      toOption.title = name;
    }
    
    fromCurrencySelect.appendChild(fromOption);
    toCurrencySelect.appendChild(toOption);
  });
  
  // Ensure selected currencies exist in the list
  const availableCodes = Object.keys(currencies);
  
  if (!availableCodes.includes(fromCurrency)) {
    fromCurrency = availableCodes.includes('USD') ? 'USD' : availableCodes[0];
  }
  
  if (!availableCodes.includes(toCurrency)) {
    toCurrency = availableCodes.includes('EUR') ? 'EUR' : 
                 (availableCodes.includes('USD') && fromCurrency !== 'USD') ? 'USD' :
                 availableCodes.find(code => code !== fromCurrency) || availableCodes[0];
  }
  
  // Set defaults
  fromCurrencySelect.value = fromCurrency;
  toCurrencySelect.value = toCurrency;
  
  // Update the inputs with the correct currencies
  if (fromMask) {
    fromMask.setCurrency(fromCurrency, getLocaleForCurrency(fromCurrency));
  }
  if (toMask) {
    toMask.setCurrency(toCurrency, getLocaleForCurrency(toCurrency));
  }
}

function toggleStaleBanner(show) {
  if (show) {
    staleBanner.classList.remove('d-none');
  } else {
    staleBanner.classList.add('d-none');
  }
}

function toggleOfflineBanner(show) {
  if (show) {
    offlineBanner.classList.remove('d-none');
  } else {
    offlineBanner.classList.add('d-none');
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorArea.classList.remove('d-none');
}

function hideError() {
  errorArea.classList.add('d-none');
}

async function updateProviderUI() {
  const provider = getProviderConfig();
  
  if (provider.requiresApiKey) {
    apiKeySection.classList.remove('d-none');
    
    // Load existing API key
    try {
      const savedKey = await loadApiKey();
      if (savedKey) {
        apiKeyInput.value = '••••••••••••••••'; // Show masked
        apiKey = savedKey;
      } else {
        apiKeyInput.value = '';
      }
    } catch (error) {
      console.warn('Failed to load API key during UI update:', error);
      apiKeyInput.value = '';
    }
  } else {
    apiKeySection.classList.add('d-none');
    apiKey = null;
  }
  
  // Update footer attribution
  updateProviderAttribution();
}

function updateProviderAttribution() {
  const provider = getProviderConfig();
  const attributionEl = document.getElementById('provider-attribution');
  
  if (attributionEl) {
    if (currentProvider === 'frankfurter') {
      attributionEl.innerHTML = `Exchange rates provided by <a href="https://www.frankfurter.app/" target="_blank" rel="noopener noreferrer" class="text-decoration-none">frankfurter.app</a>`;
    } else if (currentProvider === 'unirateapi') {
      attributionEl.innerHTML = `Exchange rates provided by <a href="https://unirateapi.com/" target="_blank" rel="noopener noreferrer" class="text-decoration-none">UniRateAPI</a>`;
    } else {
      attributionEl.innerHTML = `Exchange rates provided by ${provider.name}`;
    }
  }
}

function handleProviderChange() {
  const newProvider = providerSelect.value;
  if (newProvider !== currentProvider) {
    currentProvider = newProvider;
    localStorage.setItem('selected-provider', currentProvider);
    
    updateProviderUI();
    
    // Clear current data and reload
    fromCurrencySelect.innerHTML = '<option value="">Loading...</option>';
    toCurrencySelect.innerHTML = '<option value="">Loading...</option>';
    
    // Reset to safe defaults
    fromCurrency = 'USD';
    toCurrency = 'USD';
    
    hideError();
    
    // Reload currencies for new provider
    loadAndPopulateCurrencies();
  }
}

function handleApiKeyToggle() {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleApiKeyButton.innerHTML = '<i class="fas fa-eye-slash"></i>';
  } else {
    apiKeyInput.type = 'password';
    toggleApiKeyButton.innerHTML = '<i class="fas fa-eye"></i>';
  }
}

async function handleSaveSettings() {
  const provider = getProviderConfig();
  let success = true;
  
  // If provider requires API key, validate and save it
  if (provider.requiresApiKey) {
    const keyValue = apiKeyInput.value.trim();
    
    if (!keyValue || keyValue === '••••••••••••••••') {
      showError('Please enter a valid API key');
      return;
    }
    
    try {
      const saved = await saveApiKey(keyValue);
      if (saved) {
        apiKeyInput.value = '••••••••••••••••'; // Mask the saved key
        apiKeyInput.type = 'password';
        toggleApiKeyButton.innerHTML = '<i class="fas fa-eye"></i>';
      } else {
        showError('Failed to save API key');
        success = false;
      }
    } catch (error) {
      showError('Failed to save API key: ' + error.message);
      success = false;
    }
  }
  
  if (success) {
    hideError();
    
    // Show success message briefly
    const originalText = saveSettingsButton.textContent;
    saveSettingsButton.textContent = 'Saved!';
    saveSettingsButton.classList.remove('btn-primary');
    saveSettingsButton.classList.add('btn-success');
    
    setTimeout(() => {
      saveSettingsButton.textContent = originalText;
      saveSettingsButton.classList.remove('btn-success');
      saveSettingsButton.classList.add('btn-primary');
    }, 1500);
    
    // Close the modal
    const settingsModal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
    if (settingsModal) {
      settingsModal.hide();
    }
    
    // Reload currencies with new settings
    loadAndPopulateCurrencies();
  }
}

function renderRateMeta(rateInfo) {
  const fromLocale = getLocaleForCurrency(fromCurrency);
  const toLocale = getLocaleForCurrency(toCurrency);
  
  // Rate line with dynamic decimal places for small rates
  let formattedRate;
  if (rateInfo.rate < 0.01) {
    // For very small rates (like COP to USD), show up to 6 decimal places
    formattedRate = rateInfo.rate.toFixed(6).replace(/\.?0+$/, ''); // Remove trailing zeros
  } else if (rateInfo.rate < 1) {
    // For rates less than 1, show 4 decimal places
    formattedRate = rateInfo.rate.toFixed(4).replace(/\.?0+$/, '');
  } else {
    // For rates >= 1, show 2-4 decimal places based on size
    formattedRate = rateInfo.rate.toFixed(rateInfo.rate > 100 ? 2 : 4).replace(/\.?0+$/, '');
  }
  
  rateLine.textContent = `1 ${fromCurrency} = ${formattedRate} ${toCurrency}`;
  
  // Updated line
  const updateTime = new Date(rateInfo.fetchedAt);
  const timeFormatter = new Intl.DateTimeFormat(DEVICE_LOCALE, {
    hour: 'numeric',
    minute: 'numeric',
    day: 'numeric',
    month: 'short'
  });
  
  const provider = getProviderConfig();
  const sourceText = rateInfo.source === 'network' ? 'network' : 
                    rateInfo.source === 'cache' ? 'cache' : 'synthetic';
  updatedLine.textContent = `Updated ${timeFormatter.format(updateTime)} (${sourceText} via ${provider.name})`;
}

// Main conversion logic
async function loadAndPopulateCurrencies() {
  console.log('🔄 Loading currencies with provider:', currentProvider, 'API key:', !!apiKey);
  try {
    const currencies = await loadCurrencies();
    console.log('✅ Currencies loaded:', Object.keys(currencies).length, 'currencies');
    populateCurrencySelects(currencies);
    
    // Only try to fetch rates if we have valid currencies
    if (Object.keys(currencies).length > 0) {
      await refreshRateAndConvert('from');
    } else {
      showError('No currencies available from this provider.');
    }
  } catch (e) {
    console.error('Failed to load currencies:', e.message);
    if (e.message.includes('API key')) {
      showError('API key required or invalid. Please check your API key.');
    } else {
      showError('Failed to load currencies. Please check your connection and try again.');
    }
    
    // Try to continue with cached data or show basic interface
    try {
      const cachedKey = `currencies-cache-${currentProvider}`;
      const cached = localStorage.getItem(cachedKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        populateCurrencySelects(cachedData.data);
        console.log('Using cached currencies');
      }
    } catch (cacheError) {
      console.error('Failed to load cached currencies:', cacheError.message);
    }
  }
}

async function refreshRateAndConvert(preferredSourceField = 'from') {
  try {
    hideError();
    const rateInfo = await getRate(fromCurrency, toCurrency);
    currentRate = rateInfo;
    
    // Check if data is stale (> 24 hours)
    const stale = Date.now() - rateInfo.fetchedAt > 24 * 60 * 60 * 1000;
    toggleStaleBanner(stale);
    
    renderRateMeta(rateInfo);
    
    // Update the conversion
    isUpdatingProgrammatically = true;
    if (preferredSourceField === 'from') {
      const fromVal = fromMask.getNumber();
      toMask.setNumber(fromVal * rateInfo.rate);
    } else {
      const toVal = toMask.getNumber();
      fromMask.setNumber(toVal / rateInfo.rate);
    }
    isUpdatingProgrammatically = false;
    
    // Save the updated amounts
    saveAmountValues();
    
    // Add success animation
    document.getElementById('rate-display').classList.add('conversion-success');
    setTimeout(() => {
      document.getElementById('rate-display').classList.remove('conversion-success');
    }, 300);
    
  } catch (e) {
    console.error('Rate fetch failed:', e);
    showError('Unable to fetch rates and no cache available. Check your connection.');
  }
}

// Event Handlers
const debouncedRefreshRate = debounce(refreshRateAndConvert, 150);

function handleFromAmountChange(event) {
  if (isUpdatingProgrammatically) return;
  if (currentRate) {
    isUpdatingProgrammatically = true;
    toMask.setNumber(event.detail.number * currentRate.rate);
    isUpdatingProgrammatically = false;
  }
  saveAmountValues();
}

function handleToAmountChange(event) {
  if (isUpdatingProgrammatically) return;
  if (currentRate && currentRate.rate !== 0) {
    isUpdatingProgrammatically = true;
    fromMask.setNumber(event.detail.number / currentRate.rate);
    isUpdatingProgrammatically = false;
  }
  saveAmountValues();
}

function handleFromCurrencyChange() {
  fromCurrency = fromCurrencySelect.value;
  const newLocale = getLocaleForCurrency(fromCurrency);
  fromMask.setCurrency(fromCurrency, newLocale);
  saveCurrencySelection();
  debouncedRefreshRate('from');
}

function handleToCurrencyChange() {
  toCurrency = toCurrencySelect.value;
  const newLocale = getLocaleForCurrency(toCurrency);
  toMask.setCurrency(toCurrency, newLocale);
  saveCurrencySelection();
  debouncedRefreshRate('to');
}

function handleSwap() {
  // Swap currencies
  const tempCurrency = fromCurrency;
  fromCurrency = toCurrency;
  toCurrency = tempCurrency;
  
  // Update selects
  fromCurrencySelect.value = fromCurrency;
  toCurrencySelect.value = toCurrency;
  
  // Update masks
  fromMask.setCurrency(fromCurrency, getLocaleForCurrency(fromCurrency));
  toMask.setCurrency(toCurrency, getLocaleForCurrency(toCurrency));
  
  // Save the new currency selection and amounts
  saveCurrencySelection();
  saveAmountValues();
  
  // Refresh rate and convert
  refreshRateAndConvert('from');
}

function handleRetry() {
  refreshRateAndConvert();
}

// PWA Installation
function handleBeforeInstallPrompt(e) {
  e.preventDefault();
  deferredPrompt = e;
  installButton.classList.remove('d-none');
  installButton.classList.add('show');
}

async function handleInstallClick() {
  if (!deferredPrompt) return;
  
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  
  if (outcome === 'accepted') {
    console.log('User accepted the install prompt');
  }
  
  deferredPrompt = null;
  installButton.classList.add('d-none');
  installButton.classList.remove('show');
}

function handleAppInstalled() {
  console.log('PWA was installed');
  // Could show a success message here
}

// Force refresh handler - clears all caches and reloads
async function handleForceRefresh() {
  console.log('🔄 Force refresh requested');
  
  try {
    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      console.log('🗑️ Clearing caches:', cacheNames);
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    // Clear localStorage (but keep API keys)
    const apiKeys = {};
    for (const key in localStorage) {
      if (key.startsWith('api-key-')) {
        apiKeys[key] = localStorage[key];
      }
    }
    localStorage.clear();
    for (const key in apiKeys) {
      localStorage[key] = apiKeys[key];
    }
    
    // Unregister service worker
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    
    console.log('🎉 All caches cleared, reloading...');
    
    // Hard reload with cache bypass
    window.location.reload(true);
    
  } catch (error) {
    console.error('❌ Force refresh failed:', error);
    // Fallback to normal reload
    window.location.reload();
  }
}

// Network status
function handleOnline() {
  toggleOfflineBanner(false);
  // Optionally refresh rates when back online
  if (currentRate && currentRate.source === 'cache') {
    refreshRateAndConvert();
  }
}

function handleOffline() {
  toggleOfflineBanner(true);
}

// Service Worker Registration with update handling
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const swUrl = new URL('sw.js', window.location.href).toString();
        const registration = await navigator.serviceWorker.register(swUrl);
        
        console.log('🔧 SW registered:', registration);
        
        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('🔄 SW update found, installing...');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('✅ SW update ready');
              showUpdateNotification();
            }
          });
        });
        
        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data.type === 'SW_UPDATED') {
            console.log('🚀 SW activated with version:', event.data.version);
            hideError(); // Clear any old errors
          }
        });
        
        // Check for updates every 30 seconds in development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          setInterval(() => {
            registration.update();
          }, 30000);
        }
        
      } catch (error) {
        console.error('❌ SW registration failed:', error);
      }
    });
  }
}

// Show update notification to user
function showUpdateNotification() {
  const updateBanner = document.createElement('div');
  updateBanner.className = 'alert alert-success alert-dismissible position-fixed top-0 start-50 translate-middle-x mt-3';
  updateBanner.style.zIndex = '9999';
  updateBanner.innerHTML = `
    <strong>🎉 App Updated!</strong> 
    <button type="button" class="btn btn-success btn-sm ms-2" onclick="window.location.reload()">
      Refresh Now
    </button>
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  
  document.body.appendChild(updateBanner);
  
  // Auto-refresh after 5 seconds if user doesn't interact
  setTimeout(() => {
    if (document.contains(updateBanner)) {
      window.location.reload();
    }
  }, 5000);
}

// Request persistent storage (helps with iOS Safari retention)
async function requestPersistentStorage() {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      const isPersistent = await navigator.storage.persist();
      console.log(`Storage persistence: ${isPersistent ? 'granted' : 'denied'}`);
      
      // Show storage info for debugging
      if ('estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        console.log('Storage estimate:', estimate);
      }
      
      return isPersistent;
    } catch (error) {
      console.warn('Storage persistence request failed:', error);
      return false;
    }
  }
  return false;
}

// iOS-specific optimizations
function optimizeForIOS() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  if (isIOS) {
    console.log('iOS detected, applying optimizations');
    
    // Add iOS-specific viewport meta tag to prevent zoom issues
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    }
    
    // Add iOS-specific CSS classes
    document.body.classList.add('ios-device');
    
    // Prevent iOS Safari from clearing caches too aggressively
    // by keeping a reference to important data in memory
    window.addEventListener('pagehide', (event) => {
      if (event.persisted) {
        console.log('Page is being cached by iOS');
      }
    });
    
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('Page restored from iOS cache');
        // Refresh data if it was cached for too long
        const lastUpdate = currentRate?.fetchedAt;
        if (lastUpdate && (Date.now() - lastUpdate > 30 * 60 * 1000)) { // 30 minutes
          console.log('Refreshing stale data after iOS cache restore');
          refreshRateAndConvert().catch(console.error);
        }
      }
    });
    
    return true;
  }
  
  return false;
}

// Initialization
async function init() {
  // Request persistent storage early
  await requestPersistentStorage();
  
  // Apply iOS optimizations
  optimizeForIOS();
  
  // Set document language
  document.documentElement.lang = DEVICE_LOCALE.split('-')[0];
  
  // Load saved provider preference
  const savedProvider = localStorage.getItem('selected-provider');
  if (savedProvider && PROVIDERS[savedProvider]) {
    currentProvider = savedProvider;
  }
  
  // Load API key for current provider immediately
  try {
    apiKey = await loadApiKey();
  } catch (error) {
    console.warn('Failed to load API key:', error);
    apiKey = null;
  }
  
  // Load saved currency selection
  const savedCurrencies = loadCurrencySelection();
  if (savedCurrencies) {
    fromCurrency = savedCurrencies.from;
    toCurrency = savedCurrencies.to;
    console.log('Loaded saved currencies:', fromCurrency, 'to', toCurrency);
  }
  
  // Get DOM elements
  fromAmountInput = document.getElementById('from-amount');
  toAmountInput = document.getElementById('to-amount');
  fromCurrencySelect = document.getElementById('from-currency');
  toCurrencySelect = document.getElementById('to-currency');
  swapButton = document.getElementById('swap-button');
  rateLine = document.getElementById('rate-line');
  updatedLine = document.getElementById('updated-line');
  errorArea = document.getElementById('error-area');
  errorMessage = document.getElementById('error-message');
  retryButton = document.getElementById('retry-button');
  offlineBanner = document.getElementById('offline-banner');
  staleBanner = document.getElementById('stale-banner');
  installButton = document.getElementById('install-button');
  
  // Provider UI elements
  providerSelect = document.getElementById('provider-select');
  apiKeySection = document.getElementById('api-key-section');
  apiKeyInput = document.getElementById('api-key');
  toggleApiKeyButton = document.getElementById('toggle-api-key');
  saveSettingsButton = document.getElementById('save-settings');
  forceRefreshButton = document.getElementById('force-refresh');
  
  // Create currency inputs
  fromMask = createCurrencyInput(
    fromAmountInput, 
    fromCurrency, 
    getLocaleForCurrency(fromCurrency)
  );
  toMask = createCurrencyInput(
    toAmountInput, 
    toCurrency, 
    getLocaleForCurrency(toCurrency)
  );
  
  // Set up provider UI - ensure proper initialization
  if (providerSelect) {
    providerSelect.value = currentProvider;
    await updateProviderUI();
    
    // Debug logging
    console.log('Provider initialization:', {
      currentProvider,
      selectValue: providerSelect.value,
      providerConfig: getProviderConfig()
    });
  } else {
    console.error('providerSelect element not found during initialization');
    // Still update attribution even if modal elements aren't found
    updateProviderAttribution();
  }
  
  // Event listeners
  fromAmountInput.addEventListener('masked-change', handleFromAmountChange);
  toAmountInput.addEventListener('masked-change', handleToAmountChange);
  fromCurrencySelect.addEventListener('change', handleFromCurrencyChange);
  toCurrencySelect.addEventListener('change', handleToCurrencyChange);
  swapButton.addEventListener('click', handleSwap);
  retryButton.addEventListener('click', handleRetry);
  
  // Provider UI event listeners
  providerSelect.addEventListener('change', handleProviderChange);
  toggleApiKeyButton.addEventListener('click', handleApiKeyToggle);
  saveSettingsButton.addEventListener('click', handleSaveSettings);
  apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleSaveSettings();
    }
  });
  forceRefreshButton.addEventListener('click', handleForceRefresh);
  
  // PWA events
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
  installButton.addEventListener('click', handleInstallClick);
  
  // Network events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Initialize offline status
  toggleOfflineBanner(!navigator.onLine);
  
  try {
    // Load saved amounts or set default
    const savedAmounts = loadAmountValues();
    if (savedAmounts && (savedAmounts.fromAmount > 0 || savedAmounts.toAmount > 0)) {
      fromMask.setNumber(savedAmounts.fromAmount);
      toMask.setNumber(savedAmounts.toAmount);
      console.log('Loaded saved amounts:', savedAmounts.fromAmount, 'and', savedAmounts.toAmount);
    } else {
      // Set default amount if no saved amounts
      fromMask.setNumber(100);
    }
    
    // Load currencies and rates
    await loadAndPopulateCurrencies();
    
  } catch (e) {
    console.error('Initialization failed:', e);
    if (e.message && e.message.includes('API key')) {
      showError('API key required or invalid. Please check your API key.');
    } else {
      showError('Failed to load currencies. Please check your connection and try again.');
    }
  }
}

// Register service worker
registerServiceWorker();

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
