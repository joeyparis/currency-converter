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

function loadApiKey() {
  const stored = localStorage.getItem(`api-key-${currentProvider}`);
  return stored ? stored : null;
}

function saveApiKey(key) {
  if (key && key.trim()) {
    localStorage.setItem(`api-key-${currentProvider}`, key.trim());
    apiKey = key.trim();
    return true;
  }
  return false;
}

function clearApiKey() {
  localStorage.removeItem(`api-key-${currentProvider}`);
  apiKey = null;
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

// Simple Currency Input - works with HTML number input
function createCurrencyInput(inputEl, initialCurrency, initialLocale) {
  let currency = initialCurrency;
  let locale = initialLocale;
  let isUpdating = false;

  function handleInput() {
    if (isUpdating) return;
    
    const numValue = parseFloat(inputEl.value) || 0;
    inputEl.dispatchEvent(new CustomEvent('masked-change', {
      bubbles: true,
      detail: { number: numValue }
    }));
  }

  inputEl.addEventListener('input', handleInput);
  inputEl.addEventListener('keydown', (e) => {
    // Allow Enter to move to next field
    if (e.key === 'Enter') {
      const nextField = inputEl.id === 'from-amount' ? 
        document.getElementById('to-amount') : 
        document.getElementById('from-amount');
      if (nextField) nextField.focus();
    }
  });

  return {
    setCurrency(nextCurrency, nextLocale) {
      currency = nextCurrency;
      locale = nextLocale || locale;
      // No need to update display - number inputs handle themselves
    },
    setNumber(n) { 
      if (isUpdating) return;
      isUpdating = true;
      inputEl.value = (n || 0).toString();
      isUpdating = false;
    },
    getNumber() { 
      return parseFloat(inputEl.value) || 0;
    }
  };
}

// API Functions
async function loadCurrencies() {
  const provider = getProviderConfig();
  const key = `currencies-cache-${currentProvider}`;
  
  // Check if provider requires API key but none is available
  if (provider.requiresApiKey && !apiKey) {
    const cached = localStorage.getItem(key);
    if (cached) {
      const cachedData = JSON.parse(cached);
      return cachedData.data;
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
    
    localStorage.setItem(key, JSON.stringify({ 
      data: currencies, 
      fetchedAt: Date.now() 
    }));
    
    return currencies;
  } catch (e) {
    console.error('Failed to load currencies:', e.message);
    console.error('Provider:', currentProvider, 'API Key present:', !!apiKey);
    
    const cached = localStorage.getItem(key);
    if (cached) {
      const cachedData = JSON.parse(cached);
      console.log('Using cached currencies:', cachedData.data);
      return cachedData.data;
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
    const cached = localStorage.getItem(key);
    if (cached) {
      const record = JSON.parse(cached);
      return { ...record, source: 'cache' };
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
    
    const record = { rate, apiDate, fetchedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(record));
    return { ...record, source: 'network' };
    
  } catch (err) {
    console.error('Failed to get rate:', err.message);
    
    const cached = localStorage.getItem(key);
    if (cached) {
      const record = JSON.parse(cached);
      return { ...record, source: 'cache' };
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

function updateProviderUI() {
  const provider = getProviderConfig();
  
  if (provider.requiresApiKey) {
    apiKeySection.classList.remove('d-none');
    
    // Load existing API key
    const savedKey = loadApiKey();
    if (savedKey) {
      apiKeyInput.value = '••••••••••••••••'; // Show masked
      apiKey = savedKey;
    } else {
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

function handleSaveSettings() {
  const provider = getProviderConfig();
  let success = true;
  
  // If provider requires API key, validate and save it
  if (provider.requiresApiKey) {
    const keyValue = apiKeyInput.value.trim();
    
    if (!keyValue || keyValue === '••••••••••••••••') {
      showError('Please enter a valid API key');
      return;
    }
    
    if (saveApiKey(keyValue)) {
      apiKeyInput.value = '••••••••••••••••'; // Mask the saved key
      apiKeyInput.type = 'password';
      toggleApiKeyButton.innerHTML = '<i class="fas fa-eye"></i>';
    } else {
      showError('Failed to save API key');
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
}

function handleToAmountChange(event) {
  if (isUpdatingProgrammatically) return;
  if (currentRate && currentRate.rate !== 0) {
    isUpdatingProgrammatically = true;
    fromMask.setNumber(event.detail.number / currentRate.rate);
    isUpdatingProgrammatically = false;
  }
}

function handleFromCurrencyChange() {
  fromCurrency = fromCurrencySelect.value;
  const newLocale = getLocaleForCurrency(fromCurrency);
  fromMask.setCurrency(fromCurrency, newLocale);
  debouncedRefreshRate('from');
}

function handleToCurrencyChange() {
  toCurrency = toCurrencySelect.value;
  const newLocale = getLocaleForCurrency(toCurrency);
  toMask.setCurrency(toCurrency, newLocale);
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

// Initialization
async function init() {
  // Set document language
  document.documentElement.lang = DEVICE_LOCALE.split('-')[0];
  
  // Load saved provider preference
  const savedProvider = localStorage.getItem('selected-provider');
  if (savedProvider && PROVIDERS[savedProvider]) {
    currentProvider = savedProvider;
  }
  
  // Load API key for current provider immediately
  apiKey = loadApiKey();
  
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
    updateProviderUI();
    
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
    // Set initial amount
    fromMask.setNumber(100);
    
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
