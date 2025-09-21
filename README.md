# Currency Converter PWA

A modern, offline-capable Progressive Web App (PWA) for currency conversion with international formatting support and persistent state.

## 🌐 **[Live Demo - Try it now!](https://joeyparis.github.io/currency-converter/)**

## ✨ Features

### 💱 Multi-Provider Exchange Rates
- **Frankfurter API** - Free service with 31 major currencies
- **UniRateAPI** - Premium service with 170+ currencies (API key required)
- **Colombian Peso Support** - Now available through UniRateAPI!
- Automatic fallback to cached rates when offline

### 🌍 International Formatting
- **Thousands separators** auto-formatting (1,234.56 vs 1.234,56)
- **Locale-aware decimal separators** (comma vs dot)
- **Smart input validation** with locale-specific formatting
- **Real-time formatting** as you type with debounced updates

### 💾 Persistent State
- **Currency selection memory** - remembers your last used currency pair (30 days)
- **Amount persistence** - saves entered amounts across sessions (24 hours)
- **Provider settings** - remembers your preferred exchange rate provider
- **Graceful fallbacks** when data expires or is unavailable

### 📱 Progressive Web App
- **Offline functionality** with service worker caching
- **Installable** on mobile devices and desktop
- **Responsive design** optimized for all screen sizes
- **Auto-updates** with background service worker updates
- **Fast loading** with aggressive caching strategy

### 🎨 Modern UI/UX
- **Clean, minimal design** with floating settings gear button
- **Mobile-first approach** with compact layout
- **Dynamic provider attribution** in footer
- **Accessibility features** with proper ARIA labels
- **Bootstrap 5** styling with Font Awesome icons

## 🛠 Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Styling**: Bootstrap 5 (CSS-only, via CDN)
- **PWA**: Service Worker, Web App Manifest
- **API**: [frankfurter.app](https://www.frankfurter.app/) for exchange rates
- **Caching**: localStorage + Service Worker cache-first strategy
- **No Build Process**: Runs directly in browsers, no compilation needed

## 🚀 Quick Start

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/joeyparis/currency-converter.git
   cd currency-converter
   ```

2. **Start a local server**:
   ```bash
   # Option 1: Python 3
   python -m http.server 8080
   
   # Option 2: Node.js
   npx http-server -p 8080
   
   # Option 3: PHP
   php -S localhost:8080
   ```

3. **Open in browser**: Navigate to `http://localhost:8080`

### Testing Offline Functionality

1. **Open Chrome DevTools** → **Application** tab → **Service Workers**
2. **Check "Offline"** to simulate no network connection
3. **Refresh the page** - the app should still work with cached data
4. **Test scenarios**:
   - Initial offline load (should show error for missing rates)
   - Offline after fetching rates (should work with cached rates)
   - Stale data banner (appears after 24+ hours)

## 🏗️ Build Versioning

### Version Display
- **Build version** appears in the footer (e.g., "Build: 2025.09.21.1054 • SW: v4-stable")
- **Automatic detection** of iOS devices with "(iOS)" indicator
- **Service Worker version** included for debugging
- **Real-time updates** when new versions are deployed

### Build Scripts

```bash
# Update build version timestamp
./update-build-version.sh

# Or using npm scripts
npm run build

# Check current version
npm run version

# Update version and deploy
npm run deploy
```

### Manual Version Update
The build version follows `YYYY.MM.DD.HHMM` format and is stored in:
- `script.js`: `const BUILD_VERSION = '2025.09.21.1054'`
- `sw.js`: `const BUILD_VERSION = '2025.09.21.1054'`

## 🌐 Deployment

### GitHub Pages (Simple)

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Update currency converter"
   git push origin main
   ```

2. **Enable GitHub Pages** (one-time setup):
   - Go to **Settings** → **Pages**
   - Choose **Deploy from a branch**
   - Select **main** branch and **/ (root)** folder
   - Save

3. **Access your app**: `https://yourusername.github.io/currency-converter/`

No build process needed - GitHub Pages serves the static files directly!

### Other Hosting

This app works on any static hosting service:
- Netlify
- Vercel  
- Firebase Hosting
- GitHub Pages
- Any web server

## 📱 PWA Installation

### Android (Chrome)
1. Visit the app URL
2. Tap **"Install"** button in the header (or browser menu)
3. Confirm installation

### iOS (Safari)
1. Visit the app URL  
2. Tap **Share** → **Add to Home Screen**
3. Confirm

### Desktop (Chrome/Edge)
1. Visit the app URL
2. Click **"Install"** button in address bar
3. Confirm installation

## 🎯 Usage

1. **Choose provider** - Select between Frankfurter (free) or UniRateAPI (requires API key)
2. **Enter API key** (if using UniRateAPI) - Get your free key at [unirateapi.com](https://unirateapi.com)
3. **Select currencies** from the dropdown menus
4. **Type amount** in either field - conversion happens automatically
5. **Swap currencies** using the ⇅ button
6. **Works offline** - uses cached exchange rates when available
7. **Install as app** for quick access from home screen

### Supported Currencies

**Frankfurter Provider (Free)**:
- 31 major world currencies including:
- USD (US Dollar) 🇺🇸, EUR (Euro) 🇪🇺, GBP (British Pound) 🇬🇧
- JPY (Japanese Yen) 🇯🇵, MXN (Mexican Peso) 🇲🇽, BRL (Brazilian Real) 🇧🇷
- And 25 more major currencies

**UniRateAPI Provider (API Key Required)**:
- 170+ world currencies including:
- **COP (Colombian Peso) 🇨🇴** - Finally supported!
- ARS (Argentine Peso) 🇦🇷, CLP (Chilean Peso) 🇨🇱
- Plus all major and minor world currencies

## 🔧 Architecture

### Offline-First Strategy

- **App Shell**: Cached via Service Worker (HTML, CSS, JS, manifest, icons)
- **Exchange Rates**: Cached in localStorage with 24-hour staleness detection
- **Network-First**: Try live rates first, fallback to cache
- **Graceful Degradation**: Clear error messages when offline without cache

### Performance Features

- **Preconnection**: DNS prefetch to frankfurter.app
- **Debounced API Calls**: Prevents rapid API requests during currency changes
- **Minimal Dependencies**: Only Bootstrap CSS from CDN
- **Lazy Loading**: Service Worker only loads what's needed

## 🔐 Privacy & Security

- **No Personal Data**: No user information collected or stored
- **Client-Side Only**: All processing happens in your browser
- **HTTPS Only**: Secure connections to frankfurter.app API
- **No Tracking**: No analytics, cookies, or third-party tracking

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Exchange Rates**: Provided by [frankfurter.app](https://www.frankfurter.app/)
- **Icons**: Simple SVG design with currency symbols
- **Bootstrap**: CSS framework for responsive design
- **Open Source**: Built with open web technologies

## 🐛 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -m 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Open a Pull Request

## 📧 Support

For questions or issues:
- **GitHub Issues**: [Create an issue](https://github.com/joeyparis/currency-converter/issues)
- **Email**: [your-email@example.com]

---

**Made with ❤️ for travelers, expats, and anyone dealing with multiple currencies**

**Currency Support**: This app uses the free frankfurter.app API which supports 31 major world currencies. Unfortunately, some Latin American currencies like COP (Colombian Peso), ARS (Argentine Peso), and CLP (Chilean Peso) are not available through this service.

**For Colombian Peso Support**: Consider these alternative APIs:
- [exchangerate-api.com](https://exchangerate-api.com) (free tier available)
- [fixer.io](https://fixer.io) (free tier available)  
- [currencylayer.com](https://currencylayer.com) (free tier available)

The code can be easily modified to use a different API - just update the `API_BASE` constant and adjust the response parsing in the `loadCurrencies()` and `getRate()` functions.
