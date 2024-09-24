const {
  AppBar, Toolbar, Typography, Container, Paper, TextField, Button, Checkbox,
  FormControlLabel, CircularProgress, List, ListItem, ListItemText, Snackbar,
  Grid, Card, CardContent, LinearProgress, Tabs, Tab, Box, Divider, IconButton,
  Tooltip, Menu, MenuItem, ThemeProvider, createTheme, CssBaseline, Switch
} = MaterialUI;

const socket = io();

const darkTheme = createTheme({
  palette: {
    type: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
  },
});

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box p={3}>
          <Typography component="div">{children}</Typography>
        </Box>
      )}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = React.useState(0);
  const [crawling, setCrawling] = React.useState(false);
  const [useLogin, setUseLogin] = React.useState(false);
  const [useProxy, setUseProxy] = React.useState(false);
  const [logs, setLogs] = React.useState([]);
  const [progress, setProgress] = React.useState(0);
  const [pagesCrawled, setPagesCrawled] = React.useState(0);
  const [currentUrl, setCurrentUrl] = React.useState('');
  const [preview, setPreview] = React.useState('');
  const [ipInfo, setIpInfo] = React.useState(null);
  const [currentTime, setCurrentTime] = React.useState(new Date().toLocaleString());
  const [maxDepth, setMaxDepth] = React.useState(4);
  const [maxPages, setMaxPages] = React.useState(100);
  const [browserProfileFile, setBrowserProfileFile] = React.useState(null);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: '' });
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [proxyHost, setProxyHost] = React.useState('');
  const [proxyPort, setProxyPort] = React.useState('');
  const [proxyUsername, setProxyUsername] = React.useState('');
  const [proxyPassword, setProxyPassword] = React.useState('');
  const [twoCaptchaKey, setTwoCaptchaKey] = React.useState('');
  const [crawlStats, setCrawlStats] = React.useState({
    totalPages: 0,
    successfulPages: 0,
    failedPages: 0,
    skippedPages: 0
  });
  const [crawlData, setCrawlData] = React.useState([]);
  const [fullXPath, setFullXPath] = React.useState('');
  const [shortXPath, setShortXPath] = React.useState('');
  const [cssSelector, setCssSelector] = React.useState('');
  const [simpleSelector, setSimpleSelector] = React.useState('');
  const [elementSelector, setElementSelector] = React.useState('');
  const [idSelector, setIdSelector] = React.useState('');
  const [specialPages, setSpecialPages] = React.useState([]);
  const [specialPageUrl, setSpecialPageUrl] = React.useState('');
  const [specialPageSelector, setSpecialPageSelector] = React.useState('');

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString());
    }, 1000);

    const ctx = document.getElementById('crawlChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Taranan Sayfa Sayısı',
          data: [],
          borderColor: '#90caf9',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });

    socket.on('crawl_progress', (data) => {
      setPagesCrawled(data.pagesCrawled);
      setCurrentUrl(data.url);
      setProgress((data.pagesCrawled / maxPages) * 100);
      setLogs(prevLogs => [...prevLogs, `Tarandı: ${data.url}`]);
      setPreview(`<iframe src="${data.url}" width="100%" height="100%"></iframe>`);

      chart.data.labels.push(data.pagesCrawled);
      chart.data.datasets[0].data.push(data.pagesCrawled);
      chart.update();

      setCrawlStats(prevStats => ({
        ...prevStats,
        totalPages: data.pagesCrawled,
        successfulPages: data.successfulPages,
        failedPages: data.failedPages,
        skippedPages: data.skippedPages
      }));

      setCrawlData(prevData => [
        ...prevData,
        {
          time: new Date().toLocaleTimeString(),
          pagesCrawled: data.pagesCrawled,
          successfulPages: data.successfulPages,
          failedPages: data.failedPages
        }
      ].slice(-20));
    });

    socket.on('crawl_complete', (data) => {
      setCrawling(false);
      setLogs(prevLogs => [...prevLogs, `Tarama tamamlandı. Toplam taranan sayfa: ${data.pagesCrawled}`]);
      setSnackbar({ open: true, message: 'Tarama başarıyla tamamlandı!' });
    });

    socket.on('crawl_error', (data) => {
      setCrawling(false);
      setLogs(prevLogs => [...prevLogs, `Hata: ${data.message}`]);
      setSnackbar({ open: true, message: `Hata: ${data.message}` });
    });

    socket.on('proxy_verified', (data) => {
      setLogs(prevLogs => [...prevLogs, `Proxy doğrulandı. Kullanılan IP: ${data.ip}`]);
      setSnackbar({ open: true, message: `Proxy doğrulandı. Kullanılan IP: ${data.ip}` });
    });

    socket.on('proxy_verification_failed', () => {
      setLogs(prevLogs => [...prevLogs, 'Proxy doğrulanamadı. Normal IP kullanılıyor.']);
      setSnackbar({ open: true, message: 'Proxy doğrulanamadı. Normal IP kullanılıyor.' });
    });

    fetchIpInfo(); // IP bilgisini sayfa yüklendiğinde almak için eklenmiştir.

    return () => {
      clearInterval(timer);
      socket.off('crawl_progress');
      socket.off('crawl_complete');
      socket.off('crawl_error');
      socket.off('proxy_verified');
      socket.off('proxy_verification_failed');
    };
  }, []);

  const fetchIpInfo = () => {
    fetch('https://ipapi.co/json/')
      .then(response => response.json())
      .then(data => setIpInfo(data))
      .catch(error => console.error('IP bilgisi alınırken hata oluştu:', error));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);

    const urlValue = formData.get('url');
    if (!isValidUrl(urlValue)) {
      setSnackbar({ open: true, message: 'Lütfen geçerli bir URL giriniz.' });
      return;
    }

    formData.append('maxDepth', maxDepth);
    formData.append('maxPages', maxPages);
    formData.append('twoCaptchaKey', twoCaptchaKey);
    formData.append('fullXPath', fullXPath);
    formData.append('shortXPath', shortXPath);
    formData.append('cssSelector', cssSelector);
    formData.append('simpleSelector', simpleSelector);
    formData.append('elementSelector', elementSelector);
    formData.append('idSelector', idSelector);
    
    if (browserProfileFile) {
      formData.append('browserProfile', browserProfileFile);
    }
    if (useProxy) {
      formData.append('proxyHost', proxyHost);
      formData.append('proxyPort', proxyPort);
      formData.append('proxyUsername', proxyUsername);
      formData.append('proxyPassword', proxyPassword);
    }

    // Append special pages and selectors
    if (specialPages.length > 0) {
      formData.append('specialPages', JSON.stringify(specialPages));
    }

    fetch('/crawl', {
      method: 'POST',
      body: formData,
    })
      .then(response => response.json())
      .then(data => {
        if (data.message === 'Tarama başlatıldı.') {
          setCrawling(true);
          setLogs([]);
          setProgress(0);
          setPagesCrawled(0);
          setCrawlStats({
            totalPages: 0,
            successfulPages: 0,
            failedPages: 0,
            skippedPages: 0
          });
          setCrawlData([]);
          setSnackbar({ open: true, message: 'Tarama başarıyla başlatıldı!' });
          if (useProxy) {
            fetchIpInfo();
          }
        } else {
          setLogs(prevLogs => [...prevLogs, `Hata: ${data.error}`]);
          setSnackbar({ open: true, message: `Hata: ${data.error}` });
        }
      })
      .catch(error => {
        setLogs(prevLogs => [...prevLogs, `Hata: ${error.message}`]);
        setSnackbar({ open: true, message: `Hata: ${error.message}` });
      });
  };

  const handleStop = () => {
    fetch('/stop', { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        setCrawling(false);
        setSnackbar({ open: true, message: 'Tarama başarıyla durduruldu!' });
      })
      .catch(error => {
        setSnackbar({ open: true, message: `Tarama durdurulurken hata oluştu: ${error.message}` });
      });
  };

  const handleDownload = () => {
    window.location.href = '/download';
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleBrowserProfileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.tar.gz')) {
      setBrowserProfileFile(file);
      setLogs(prevLogs => [...prevLogs, "Tarayıcı profili başarıyla yüklendi."]);
      setSnackbar({ open: true, message: 'Tarayıcı profili başarıyla yüklendi!' });
    } else {
      setSnackbar({ open: true, message: 'Lütfen geçerli bir .tar.gz dosyası yükleyiniz.' });
    }
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  function isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  const handleSpecialPageAddition = () => {
    setSpecialPages(prevPages => [
      ...prevPages,
      { url: specialPageUrl, selector: specialPageSelector }
    ]);
    setSpecialPageUrl('');
    setSpecialPageSelector('');
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" style={{ flexGrow: 1 }}>Gelişmiş Web Tarayıcı</Typography>
          <Tooltip title="Ayarlar">
            <IconButton color="inherit" onClick={handleMenuOpen}>
              <span className="material-icons">settings</span>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={anchorEl}
            keepMounted
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={() => { setTabValue(1); handleMenuClose(); }}>Tarayıcı Ayarları</MenuItem>
            <MenuItem onClick={handleMenuClose}>Hakkında</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" style={{ marginTop: '2rem' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="crawler tabs">
          <Tab label="Tarama" />
          <Tab label="Ayarlar" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <div className="grid-container">
            <Paper className="paper full-width">
              <form onSubmit={handleSubmit}>
                <TextField
                  fullWidth
                  margin="normal"
                  label="Web Sitesi URL'si"
                  name="url"
                  required
                  variant="outlined"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={useLogin}
                      onChange={(e) => setUseLogin(e.target.checked)}
                      name="useLogin"
                      color="primary"
                    />
                  }
                  label="Giriş Bilgileri Kullan"
                />
                {useLogin && (
                  <React.Fragment>
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Kullanıcı Adı"
                      name="username"
                      variant="outlined"
                      required
                    />
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Şifre"
                      name="password"
                      type="password"
                      variant="outlined"
                      required
                    />
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Giriş URL'si"
                      name="loginUrl"
                      variant="outlined"
                      required
                    />
                  </React.Fragment>
                )}
                <FormControlLabel
                  control={
                    <Switch
                      checked={useProxy}
                      onChange={(e) => setUseProxy(e.target.checked)}
                      name="useProxy"
                      color="primary"
                    />
                  }
                  label="Proxy Kullan"
                />
                {useProxy && (
                  <React.Fragment>
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Proxy Host"
                      name="proxyHost"
                      variant="outlined"
                      value={proxyHost}
                      onChange={(e) => setProxyHost(e.target.value)}
                      required
                    />
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Proxy Port"
                      name="proxyPort"
                      variant="outlined"
                      value={proxyPort}
                      onChange={(e) => setProxyPort(e.target.value)}
                      required
                    />
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Proxy Kullanıcı Adı"
                      name="proxyUsername"
                      variant="outlined"
                      value={proxyUsername}
                      onChange={(e) => setProxyUsername(e.target.value)}
                    />
                    <TextField
                      fullWidth
                      margin="normal"
                      label="Proxy Şifresi"
                      name="proxyPassword"
                      type="password"
                      variant="outlined"
                      value={proxyPassword}
                      onChange={(e) => setProxyPassword(e.target.value)}
                    />
                  </React.Fragment>
                )}
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  style={{ marginTop: '1rem' }}
                  disabled={crawling}
                >
                  {crawling ? 'Tarama Devam Ediyor...' : 'Tarama Başlat'}
                </Button>
              </form>
              {crawling && (
                <Button
                  variant="contained"
                  color="secondary"
                  fullWidth
                  style={{ marginTop: '1rem' }}
                  onClick={handleStop}
                >
                  Tarama Durdur
                </Button>
              )}
              <Button
                variant="contained"
                color="primary"
                fullWidth
                style={{ marginTop: '1rem' }}
                onClick={handleDownload}
                disabled={!crawlStats.totalPages}
              >
                Tarama Sonucunu İndir
              </Button>
            </Paper>
            <Paper className="paper">
              <Typography variant="h6">Tarama İlerlemesi</Typography>
              <LinearProgress
                variant="determinate"
                value={progress}
                style={{ marginTop: '1rem', height: '20px' }}
              />
              <Typography align="center" style={{ marginTop: '0.5rem' }}>
                {progress.toFixed(2)}%
              </Typography>
              <Typography>Taranan Sayfa: {pagesCrawled}</Typography>
              <Typography>Şu Anki URL: {currentUrl}</Typography>
              <div className="chart-container">
                <canvas id="crawlChart"></canvas>
              </div>
              <Typography>
                Başarılı: {crawlStats.successfulPages} |
                Başarısız: {crawlStats.failedPages} |
                Atlanan: {crawlStats.skippedPages}
              </Typography>
            </Paper>
            <Paper className="paper logs-container">
              <Typography variant="h6">Tarama Logları</Typography>
              <List>
                {logs.map((log, index) => (
                  <ListItem key={index}>
                    <ListItemText
                      primary={log}
                      style={{
                        color: log.includes('Hata') ? '#f44336' :
                          log.includes('Tarandı') ? '#4caf50' :
                            '#ffffff'
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
            <Paper className="paper preview-container">
              <Typography variant="h6">Sayfa Önizlemesi</Typography>
              <div className="browser-toolbar">
                <input type="text" value={currentUrl} readOnly />
              </div>
              <div dangerouslySetInnerHTML={{ __html: preview }}></div>
            </Paper>
          </div>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <div className="grid-container">
            <Paper className="paper">
              <Typography variant="h6">Tarayıcı Ayarları</Typography>
              <TextField
                fullWidth
                margin="normal"
                label="Maksimum Derinlik"
                type="number"
                value={maxDepth}
                onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                variant="outlined"
              />
              <TextField
                fullWidth
                margin="normal"
                label="Maksimum Sayfa Sayısı"
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value))}
                variant="outlined"
              />
              <TextField
                fullWidth
                margin="normal"
                label="2captcha API Anahtarı"
                value={twoCaptchaKey}
                onChange={(e) => setTwoCaptchaKey(e.target.value)}
                variant="outlined"
              />
              <input
                accept=".tar.gz"
                style={{ display: 'none' }}
                id="browser-profile-upload"
                type="file"
                onChange={handleBrowserProfileUpload}
              />
              <label htmlFor="browser-profile-upload">
                <Button
                  variant="contained"
                  component="span"
                  fullWidth
                  style={{ marginTop: '1rem' }}
                >
                  Tarayıcı Profili Yükle (.tar.gz)
                </Button>
              </label>
              {browserProfileFile && (
                <Typography style={{ marginTop: '0.5rem' }}>
                  Yüklenen Profil: {browserProfileFile.name}
                </Typography>
              )}
            </Paper>
            <Paper className="paper">
              <Typography variant="h6">Sistem Bilgileri</Typography>
              <Typography>Güncel Zaman: {currentTime}</Typography>
              {ipInfo && (
                <React.Fragment>
                  <Typography>IP Adresi: {ipInfo.ip}</Typography>
                  <Typography>Ülke: {ipInfo.country_name}</Typography>
                  <Typography>Şehir: {ipInfo.city}</Typography>
                  <Typography>Bölge: {ipInfo.region}</Typography>
                  <Typography>ISP: {ipInfo.org}</Typography>
                  <Typography>Zaman Dilimi: {ipInfo.timezone}</Typography>
                  {useProxy && (
                    <Typography>Proxy Kullanılıyor: Evet</Typography>
                  )}
                </React.Fragment>
              )}
            </Paper>
          </div>
        </TabPanel>
      </Container>
      <Snackbar
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
        action={
          <React.Fragment>
            <Button color="secondary" size="small" onClick={() => setSnackbar({ ...snackbar, open: false })}>
              KAPAT
            </Button>
          </React.Fragment>
        }
      />
    </ThemeProvider>
  );
}

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);
