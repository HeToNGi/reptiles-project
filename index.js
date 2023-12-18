const puppeteer = require('puppeteer');
const db = require('./db/index.js');
const schedule = require('node-schedule');

let launchParameters = {
  args: [
    '--disable-setuid-sandbox',
    '--no-sandbox',
  ]
};
launchParameters.headless = true; //是否关闭浏览器界面
// launchParameters.devtools  = true
// Puppeteer 启动 Chromium
// const structureMap = [{
//   url: 'http://weather.cma.cn/web/weather/54433.html',
//   reValue: [{
//     selector: '',
//   }]
// }];

// 获取天气情况，目前只有北京天气，其他城市后续更新
async function getWeather(){
  const browser = await puppeteer.launch(launchParameters); // 设置 headless 为 false 以便观察 WebGL 渲染
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    await page.goto('http://weather.cma.cn/web/weather/54511.html',  { timeout: 120000 });
    const temperature = await page.$eval('#temperature', element => element.textContent);
    const pressure = await page.$eval('#pressure', element => element.textContent);
    const humidity = await page.$eval('#humidity', element => element.textContent);
    const precipitation = await page.$eval('#precipitation', element => element.textContent);
    const wind = await page.$eval('#wind', element => element.textContent);
    const tableData = await page.$$eval('#hourTable_0 tr', rows => {
      const selectedRows = rows.slice(0, 3); // 选择第1、2和3行
      return selectedRows.map((row, index) => {
        const columns = row.querySelectorAll('td');
        const selectedColumns = Array.from(columns).slice(1);
        return selectedColumns.map(c => {
          if (index === 1) {
            return c.querySelector('img').src
          }
          return c.textContent
        });
      });
    });
    const hour_weather = tableData[0].map((t, i) => {
      return {
        time: t,
        temperature: tableData[2][i],
        icon: tableData[1][i],
      }
    });
    const futureWeather = await page.$$eval('#dayList .day', divs => {
      return divs.map(d => {
        const icon = d.querySelector('.dayicon > img').src;
        const weather = d.querySelector('.day-item:nth-child(3)').textContent.trim();
        const day = d.querySelector('.day-item:nth-child(1)').textContent.trim();
        const high = d.querySelector('.high').textContent.trim();
        const low = d.querySelector('.low').textContent.trim();
        return {
          icon,
          weather,
          day,
          temperature: [low, high]
        }
      })
    })
    const data = {
      id: 1,
      temperature, // 当前温度
      pressure, // 当前大气压
      humidity, // 湿度
      precipitation, // 降水量
      wind, // 风向
      hour_weathers: JSON.stringify(hour_weather),
      icon: futureWeather[0] ? futureWeather[0].icon : '',
      weather: futureWeather[0] ? futureWeather[0].weather : '',
      future_weather: JSON.stringify(futureWeather || []),
    };
    const query = `
      INSERT INTO weather_data (id, temperature, pressure, humidity, precipitation, wind, hour_weathers, icon, weather, future_weather)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        temperature = VALUES(temperature),
        pressure = VALUES(pressure),
        humidity = VALUES(humidity),
        precipitation = VALUES(precipitation),
        wind = VALUES(wind),
        hour_weathers = VALUES(hour_weathers),
        icon = VALUES(icon),
        weather = VALUES(weather),
        future_weather = VALUES(future_weather)`;
    db.query(query, [1, data.temperature, data.pressure, data.humidity, data.precipitation, data.wind, data.hour_weathers, data.icon, data.weather, data.future_weather], (result) => {
      console.log('查询了一次天气，当前时间：', new Date(), JSON.stringify(data));
    });
  }
  await recursiveCallCreatePage();
  // 其他测试逻辑
  await browser.close();
};

// 获取股价，每隔一小时更新
async function obtainStockPrice(){
  const browser = await puppeteer.launch(launchParameters);
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    await page.goto('https://gushitong.baidu.com',  { timeout: 120000 });
    await page.waitForSelector('.hot-stock-item');
    const stockPrice = await page.$$eval('.page-module .hot-stock-item', elements => {
      return elements.map(e => {
        const name = e.querySelector('.name').textContent;
        const price = e.querySelectorAll('.right-label')[0].textContent;
        const increase = e.querySelectorAll('.right-label')[1].textContent;
        return [
          name,
          price,
          increase
        ]
      })
    });
    if (stockPrice.length && stockPrice[0].length) {
      db.query('DELETE FROM stock_info', '', (result) => {
        const query = 'INSERT INTO stock_info (name, price, increase) VALUES ?'
        db.query(query, [stockPrice], (result) => {
          console.log('查询了一次股票信息，当前时间：', new Date(), JSON.stringify(stockPrice));
        });
      });
      
    }
  }
  await recursiveCallCreatePage();
  // 其他测试逻辑
  await browser.close();
};

async function getNews() {
const browser = await puppeteer.launch(launchParameters);
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    await page.goto('https://news.cctv.com/',  { timeout: 120000 });
    const news_one = await page.$$eval('#slide .silde', elements => {
      const title_href = elements.map(ele => {
        const a = ele.querySelector('h3 > a')
        let img = ele.querySelector('img').getAttribute('data-src')
        if (!img) {
          img = ele.querySelector('img').src;
        } else {
          img = 'https:' + img;
        }
        return {title: a.textContent, href: a.href, img,};
      })
      return title_href;
    });
    const news_two = await page.$$eval('#newslist li', elements => {
      const title_href = elements.map(ele => {
        const a = ele.querySelector('.title > a')
        let img = ele.querySelector('img').getAttribute('data-echo')
        if (!img) {
          img = ele.querySelector('img').src;
        }
        return {title: a.textContent, href: a.href, img,};
      })
      return title_href;
    });

    // const news_two = await page.$$eval('.news_list a', elements => {
    //   return elements.map(ele => ({title: ele.title, href: ele.href, img: ''}));
    // });
    const news = [...news_one, ...news_two].map(n => {
      return [n.title, n.href, n.img]
    })
    
    db.query('DELETE FROM news', '', (result) => {
      const query = 'INSERT INTO news (title, href, img) VALUES ?'
      db.query(query, [news], (result) => {
        console.log('查询了一次新闻，当前时间：', new Date());
      });
    })
  }
  await recursiveCallCreatePage();
  // 其他测试逻辑
  await browser.close();
}

async function getMicroSoftStoreSild(type, eleType) {
  const browser = await puppeteer.launch(launchParameters);
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 940 });
    await page.goto(`https://apps.microsoft.com/${type}?hl=zh-cn&gl=US`,  { timeout: 120000 });
    // let sildesList = [];
    let sildesList = await page.evaluate(async (eleType) => {
      const appIndex = document.querySelector('app-index').shadowRoot
      const homePage = appIndex.querySelector(eleType+'-page').shadowRoot;
      // 获取 轮播资源
      const productSpotlightControl = homePage.querySelector('product-spotlight-control').shadowRoot;
      const productSpotlight = productSpotlightControl.querySelector('product-spotlight').shadowRoot;
      const imgs = productSpotlight.querySelectorAll('.spot-img');
      const sildes = [];
      imgs.forEach(i => {
        const spotLightCard = i.querySelector('spot-light-card').shadowRoot;
        sildes.push({
          img: spotLightCard.querySelector('img').src,
          title: spotLightCard.querySelector('.title div').textContent,
          detail: spotLightCard.querySelector('.detail').textContent,
        });
      });
      // 去重
      const data = sildes.filter((l, index) => {
        const fIndex = sildes.findIndex(i => i.img === l.img);
        return index === fIndex;
      });
      return data;
    }, eleType || type);
    sildesList = sildesList.map(item => {
      return [item.title, item.img, item.detail, type]
    })
    const query = 'INSERT INTO store_slider (title, img, detail, type) VALUES ?'
    db.query('DELETE FROM store_slider WHERE type = ?', [type], (error, results, fields) => {
      db.query(query, [sildesList], (result) => {
        console.log('更新storeSilder信息', new Date());
      });
    });
  }
  await recursiveCallCreatePage();
  // 其他测试逻辑
  await browser.close();
}

async function getStoreApps (url, type) {
  const browser = await puppeteer.launch(launchParameters);
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    // await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await page.goto(url,  { timeout: 120000 });
    await page.waitForSelector('body');
    await page.waitForSelector('app-index');
    // await page.waitForEvent('domcontentloaded');
    const data = await page.evaluate(() => {
      const apps = [];
      const appIndex = document.querySelector('app-index').shadowRoot
      const collectionsPage = appIndex.querySelector('collections-page').shadowRoot;
      const hero_img = collectionsPage.querySelector('.hero-img').style.cssText;
      const productCollection = collectionsPage.querySelector('product-collection').shadowRoot;
      const slAnimationList = productCollection.querySelectorAll('sl-animation');
      for (let i = 0; i < slAnimationList.length; i++) {
        const squareCard = slAnimationList[i].querySelector('square-card').shadowRoot;
        const img = squareCard.querySelector('sl-animation').querySelector('img').src;
        const img_bg = squareCard.querySelector('.img-bg').style;
        const title = squareCard.querySelector('.desc .title').textContent;
        const rating = squareCard.querySelector('.desc .rating-element span').textContent;
        const price = squareCard.querySelector('price-badge').shadowRoot.querySelector('div').textContent;
        apps.push({
          img,
          img_bg: img_bg.cssText,
          title,
          rating,
          price,
          desc: '',
        })
      }
      return { apps, hero_img };
    });
    if (data.apps && data.apps.length) {
      data.apps = data.apps.map(i => ([i.title, i.img, i.img_bg, i.rating, i.price, i.desc, type]));
      const query = 'INSERT INTO store_apps (title, img, img_bg, rating, price, `desc`, type) VALUES ?'
      db.query('DELETE FROM store_apps WHERE type = ?', [type], (error, results, fields) => {
        db.query(query, [data.apps], (result) => {
          console.log('更新storeApp信息', new Date());
        });
      });
    }
  }
  await recursiveCallCreatePage();
  // 其他测试逻辑
  await browser.close();
}

async function getCreativityDesc(){
  const browser = await puppeteer.launch(launchParameters);
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 940 });
    await page.goto(`https://apps.microsoft.com/home?hl=zh-cn&gl=US`,  { timeout: 120000 });
    // let sildesList = [];
    await page.waitForSelector('body');
    const data = await page.evaluate(async () => {
      // document.documentElement.scrollTop = 2078.5;
      const descs = [];
      // 页面渲染结束后执行的操作
      const appIndex = document.querySelector('app-index').shadowRoot
      const homePage = appIndex.querySelector('home-page').shadowRoot;
      const productCollectionsWrap = homePage.querySelector('.product-collections-wrap')
      const lazyLoadList = productCollectionsWrap.querySelectorAll('lazy-load');
      // const element = document.getElementById('targetElementId'); // 替换为你要滚动到的元素的 ID
      // lazyLoadList[4].scrollIntoView({ behavior: 'smooth', block: 'center' });
      let productCollection4 = null;
      await new Promise((resolve, reject) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.documentElement.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          if (totalHeight >= scrollHeight && lazyLoadList[4].querySelector('product-collection')) {
            productCollection4 = lazyLoadList[4].querySelector('product-collection').shadowRoot;
            if (productCollection4.querySelectorAll('sl-animation').length) {
              clearInterval(timer);
              resolve();
            }
          }
        }, 100);
      });
      const slAnimationList4 = productCollection4.querySelectorAll('sl-animation');
      for (let i = 0; i < slAnimationList4.length; i++) {
        const wideDetailsCard = slAnimationList4[i].querySelector('wide-details-card').shadowRoot;
        const title = wideDetailsCard.querySelector('.title').textContent;
        const desc = wideDetailsCard.querySelector('.desc').textContent;
        descs.push({
          title,
          desc,
        })
      }
      return descs;
    });
    if (data && data.length) {
      let count = 0;
      for (let item of data) {
        const { title, desc } = item;
        db.query(`UPDATE store_apps SET \`desc\` = '${desc}' WHERE title = '${title}'`, (error, results, fields) => {
          count++
          if (count === data.length) {
            console.log('添加描述storeApp信息', new Date());
          }
        });
      }
    }
  }
  await recursiveCallCreatePage();
  // 其他测试逻辑
  await browser.close();
}


// 获取游戏
async function getStoreGames(url, type){
  const browser = await puppeteer.launch(launchParameters);
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 940 });
    await page.goto(url,  { timeout: 120000 });
    // let sildesList = [];
    await page.waitForSelector('body');
    let data = await page.evaluate(async () => {
      // document.documentElement.scrollTop = 2078.5;
      const games = [];
      // 页面渲染结束后执行的操作
      const appIndex = document.querySelector('app-index').shadowRoot
      const collectionsPage = appIndex.querySelector('collections-page').shadowRoot;
      const productCollection = collectionsPage.querySelector('product-collection').shadowRoot;
      const slAnimationList = productCollection.querySelectorAll('sl-animation')
      for (let i = 0; i < slAnimationList.length; i++) {
        const tallCard = slAnimationList[i].querySelector('tall-card').shadowRoot;
        const img = tallCard.querySelector('.img-wrap').querySelector('img').src;
        const title = tallCard.querySelector('.title').textContent;
        const rating = tallCard.querySelector('.rating-element span').textContent;
        const price = tallCard.querySelector('price-badge').shadowRoot.querySelector('div').textContent;
        const gamePassBadge = tallCard.querySelector('game-pass-badge').shadowRoot.querySelector('div') ? tallCard.querySelector('game-pass-badge').shadowRoot.querySelector('div').textContent : ''
        games.push({
          img,
          title,
          rating,
          price,
          gamePassBadge,
          desc: '',
        });
      }
      return games;
    });
    if (data && data.length) {
      data = data.map(i => ([i.title, i.img, i.rating, i.price, i.desc, type]));
      const query = 'INSERT INTO store_games (title, img, rating, price, `desc`, type) VALUES ?'
      db.query('DELETE FROM store_games WHERE type = ?', [type], (error, results, fields) => {
        db.query(query, [data], (result) => {
          console.log('更新storeGames信息', new Date());
        });
      });
    }
    // console.log(data);
  }
  await recursiveCallCreatePage();
  // 其他测试逻辑
  await browser.close();
}

async function getWeeklyDeal(){
  const browser = await puppeteer.launch(launchParameters);
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 940 });
    await page.goto('https://apps.microsoft.com/home?hl=zh-cn&gl=US',  { timeout: 120000 });
    // let sildesList = [];
    await page.waitForSelector('body');
    let data = await page.evaluate(async () => {
      const appIndex = document.querySelector('app-index').shadowRoot
      const homePage = appIndex.querySelector('home-page').shadowRoot;
      const productCollectionsWrap = homePage.querySelector('.product-collections-wrap')
      const lazyLoadList = productCollectionsWrap.querySelectorAll('lazy-load');
      // const element = document.getElementById('targetElementId'); // 替换为你要滚动到的元素的 ID
      // lazyLoadList[4].scrollIntoView({ behavior: 'smooth', block: 'center' });
      let productCollection5 = null;
      await new Promise((resolve, reject) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.documentElement.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          if (totalHeight >= scrollHeight && lazyLoadList[6].querySelector('product-collection')) {
            productCollection5 = lazyLoadList[6].querySelector('product-collection').shadowRoot;
            if (productCollection5.querySelectorAll('sl-animation').length) {
              clearInterval(timer);
              resolve();
            }
          }
        }, 100);
      });
      const descs = [];
      const slAnimationList5 = productCollection5.querySelectorAll('sl-animation');
      for (let i = 0; i < slAnimationList5.length; i++) {
        const rankedCard = slAnimationList5[i].querySelector('ranked-card').shadowRoot;
        const num = rankedCard.querySelector('.ranked-num').textContent;
        const title = rankedCard.querySelector('.ranked-title').textContent;
        const desc = rankedCard.querySelector('.ranked-description').textContent;
        const backgroundImage = rankedCard.querySelector('.img-container').style.backgroundImage
        const regex = /url\("([^"]+)"\)/;
        const match = backgroundImage.match(regex);
        let img = '';
        if (match) {
          img = match[1]
        }
        descs.push({
          num,
          title,
          desc,
          img,
          rating: '',
          price: '',
          type: 'weekly_deal'
        })
      }
      return descs;
    });
    if (data && data.length) {
      const type = 'weekly_deal'
      data = data.map(i => ([i.title, i.img, i.rating, i.price, i.desc, type]));
      const query = 'INSERT INTO store_games (title, img, rating, price, `desc`, type) VALUES ?'
      db.query('DELETE FROM store_games WHERE type = ?', [type], (error, results, fields) => {
        db.query(query, [data], (result) => {
          console.log('更新storeGames信息', new Date());
        });
      });
    }
    console.log(data);
  }
  await recursiveCallCreatePage();
  // 其他测试逻辑
  await browser.close();
}


async function getStoreMovies(url, type){
  const browser = await puppeteer.launch(launchParameters);
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 940 });
    await page.goto(url,  { timeout: 120000 });
    // let sildesList = [];
    await page.waitForSelector('body');
    let data = await page.evaluate(async () => {
      // document.documentElement.scrollTop = 2078.5;
      const movies = [];
      // 页面渲染结束后执行的操作
      const appIndex = document.querySelector('app-index').shadowRoot
      const collectionsPage = appIndex.querySelector('collections-page').shadowRoot;
      const productCollection = collectionsPage.querySelector('product-collection').shadowRoot;
      const slAnimationList = productCollection.querySelectorAll('sl-animation')
      for (let i = 0; i < slAnimationList.length; i++) {
        const tallCard = slAnimationList[i].querySelector('tall-card').shadowRoot;
        const img = tallCard.querySelector('.img-wrap').querySelector('img').src;
        const title = tallCard.querySelector('.title').textContent;
        const rating = tallCard.querySelector('.rating-element span').textContent;
        const price = tallCard.querySelector('price-badge').shadowRoot.querySelector('div').textContent;
        const gamePassBadge = tallCard.querySelector('game-pass-badge').shadowRoot.querySelector('div') ? tallCard.querySelector('game-pass-badge').shadowRoot.querySelector('div').textContent : ''
        movies.push({
          img,
          title,
          rating,
          price,
          gamePassBadge,
          desc: '',
        });
      }
      return movies;
    });
    if (data && data.length) {
      data = data.map(i => ([i.title, i.img, i.rating, i.price, i.desc, type]));
      const query = 'INSERT INTO store_movies (title, img, rating, price, `desc`, type) VALUES ?'
      db.query('DELETE FROM store_movies WHERE type = ?', [type], (error, results, fields) => {
        db.query(query, [data], (result) => {
          console.log('更新storeMovies信息', new Date());
        });
      });
    }
    console.log(data);
  }
  await recursiveCallCreatePage();
  // 其他测试逻辑
  await browser.close();
}

// 获取电影
async function getStoreCollectionsList(url, type, table){
  const browser = await puppeteer.launch(launchParameters);
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 940 });
    await page.goto(url,  { timeout: 120000 });
    // let sildesList = [];
    await page.waitForSelector('body');
    let data = await page.evaluate(async () => {
      // document.documentElement.scrollTop = 2078.5;
      const movies = [];
      // 页面渲染结束后执行的操作
      const appIndex = document.querySelector('app-index').shadowRoot
      const collectionsPage = appIndex.querySelector('collections-page').shadowRoot;
      const productCollection = collectionsPage.querySelector('product-collection').shadowRoot;
      const slAnimationList = productCollection.querySelectorAll('sl-animation')
      for (let i = 0; i < slAnimationList.length; i++) {
        const tallCard = slAnimationList[i].querySelector('tall-card').shadowRoot;
        const img = tallCard.querySelector('.img-wrap').querySelector('img').src;
        const title = tallCard.querySelector('.title').textContent;
        const rating = tallCard.querySelector('.rating-element span').textContent;
        const price = tallCard.querySelector('price-badge').shadowRoot.querySelector('div').textContent;
        const gamePassBadge = tallCard.querySelector('game-pass-badge').shadowRoot.querySelector('div') ? tallCard.querySelector('game-pass-badge').shadowRoot.querySelector('div').textContent : ''
        movies.push({
          img,
          title,
          rating,
          price,
          gamePassBadge,
          desc: '',
        });
      }
      return movies;
    });
    if (data && data.length) {
      data = data.map(i => ([i.title, i.img, i.rating, i.price, i.desc, type]));
      const query = `INSERT INTO ${table} (title, img, rating, price, \`desc\`, type) VALUES ?`
      db.query(`DELETE FROM ${table} WHERE type = ?`, [type], (error, results, fields) => {
        db.query(query, [data], (result) => {
          console.log(`更新${table}信息`, new Date());
        });
      });
    }
    console.log(data);
  }
  await recursiveCallCreatePage();
  // 其他测试逻辑
  await browser.close();
}

// getStoreMovies('https://apps.microsoft.com/collections/movies/video.collections.fh_4kuhdmovies_actionadventure?hl=zh-cn&gl=US', 'action_adventure');
// getStoreMovies('https://apps.microsoft.com/collections/movies/video.collections.fh_4kuhdmovies_family?hl=zh-cn&gl=US', 'kids_family');
// getStoreMovies('https://apps.microsoft.com/collections/movies/video.collections.fh_4kuhdmovies_drama?hl=zh-cn&gl=US', 'drama');
// getStoreMovies('https://apps.microsoft.com/collections/movies/video.collections.fh_4kuhdmovies_comedy?hl=zh-cn&gl=US', 'comedy');

// 获取最新电影
// getStoreCollectionsList('https://apps.microsoft.com/collections/movies/video.newreleases.movies?hl=zh-cn&gl=US', 'new_movies', 'store_movies')
// getStoreCollectionsList('https://apps.microsoft.com/collections/movies/video.topselling.movies?hl=zh-cn&gl=US', 'top_selling', 'store_movies')
// getStoreCollectionsList('https://apps.microsoft.com/collections/movies/video.topselling.tv?hl=zh-cn&gl=US', 'top_selling_tv', 'store_movies')

// 获取最畅销游戏
// getStoreCollectionsList('https://apps.microsoft.com/collections/computed/games/TopGrossing?hl=zh-cn&gl=US', 'top_grossing_game', 'store_games');
// getWeeklyDeal(); 
// getStoreGames('https://apps.microsoft.com/collections/MerchandiserContent/Games/Primary/NewAndNotablePCGames/_NewAndNotablePCGames?hl=zh-cn&gl=US&hasHeroImage=true', 'new_notavlepc')
// getStoreApps('https://apps.microsoft.com/collections/MerchandiserContent/Apps/Primary/BestProductivityApps/_BestProductivityApps?hl=zh-cn&gl=US&hasHeroImage=true', 'productivity')
// getStoreApps('https://apps.microsoft.com/collections/MerchandiserContent/Apps/Primary/EssentialApps/_EssentialApps?hl=zh-cn&gl=US&hasHeroImage=true', 'essential')
// getStoreApps('https://apps.microsoft.com/collections/MerchandiserContent/Apps/Primary/ExploreAWorldOfMusic/_ExploreAWorldOfMusic?hl=zh-cn&gl=US&hasHeroImage=true', 'musice_streaming')
// getStoreApps('https://apps.microsoft.com/collections/MerchandiserContent/Apps/Primary/BestCreativityApps/_BestCreativityApps?hl=zh-cn&gl=US&hasHeroImage=true', 'creativity')
// getCreativityDesc()
// getMicroSoftStoreSild('movies');
// getMicroSoftStoreSild('home');
// getMicroSoftStoreSild('apps');
// getMicroSoftStoreSild('games', 'gaming');
let job_weather = schedule.scheduleJob('*/30 * * * *', () => {
  // 获取股票信息，每半小时执行一次
  // console.log('获取一次天气');
  getWeather();
});
let job_News = schedule.scheduleJob('0 9 * * *', () => {
  // 获取新闻数据，每天早上九点执行一次
  // console.log('获取一次新闻')
  getNews();
});
let job_stockPrice = schedule.scheduleJob('*/30 * * * *', () => {
  // 获取股票信息，每半小时执行一次
  // console.log('获取一次股票信息')
  obtainStockPrice();
});
// async function job() {
//   await getMicroSoftStoreSild('movies');
//   await getMicroSoftStoreSild('home');
//   await getMicroSoftStoreSild('apps');
//   await getMicroSoftStoreSild('games', 'gaming');
//   await getStoreCollectionsList('https://apps.microsoft.com/collections/computed/games/TopGrossing?hl=zh-cn&gl=US', 'top_grossing_game', 'store_games');
//   await getWeeklyDeal(); 
//   await getStoreGames('https://apps.microsoft.com/collections/MerchandiserContent/Games/Primary/NewAndNotablePCGames/_NewAndNotablePCGames?hl=zh-cn&gl=US&hasHeroImage=true', 'new_notavlepc')
//   await getStoreApps('https://apps.microsoft.com/collections/MerchandiserContent/Apps/Primary/BestProductivityApps/_BestProductivityApps?hl=zh-cn&gl=US&hasHeroImage=true', 'productivity')
//   await getStoreApps('https://apps.microsoft.com/collections/MerchandiserContent/Apps/Primary/EssentialApps/_EssentialApps?hl=zh-cn&gl=US&hasHeroImage=true', 'essential')
//   await getStoreApps('https://apps.microsoft.com/collections/MerchandiserContent/Apps/Primary/ExploreAWorldOfMusic/_ExploreAWorldOfMusic?hl=zh-cn&gl=US&hasHeroImage=true', 'musice_streaming')
//   await getStoreApps('https://apps.microsoft.com/collections/MerchandiserContent/Apps/Primary/BestCreativityApps/_BestCreativityApps?hl=zh-cn&gl=US&hasHeroImage=true', 'creativity')
//   await getCreativityDesc();
//   await getStoreCollectionsList('https://apps.microsoft.com/collections/movies/video.newreleases.movies?hl=zh-cn&gl=US', 'new_movies', 'store_movies')
//   await getStoreCollectionsList('https://apps.microsoft.com/collections/movies/video.topselling.movies?hl=zh-cn&gl=US', 'top_selling', 'store_movies')
//   await getStoreCollectionsList('https://apps.microsoft.com/collections/movies/video.topselling.tv?hl=zh-cn&gl=US', 'top_selling_tv', 'store_movies')
//   await getStoreMovies('https://apps.microsoft.com/collections/movies/video.collections.fh_4kuhdmovies_actionadventure?hl=zh-cn&gl=US', 'action_adventure');
//   await getStoreMovies('https://apps.microsoft.com/collections/movies/video.collections.fh_4kuhdmovies_family?hl=zh-cn&gl=US', 'kids_family');
//   await getStoreMovies('https://apps.microsoft.com/collections/movies/video.collections.fh_4kuhdmovies_drama?hl=zh-cn&gl=US', 'drama');
//   await getStoreMovies('https://apps.microsoft.com/collections/movies/video.collections.fh_4kuhdmovies_comedy?hl=zh-cn&gl=US', 'comedy');
// }

// const rule = new schedule.RecurrenceRule();
// rule.dayOfWeek = 0; // 0 表示星期日
// rule.hour = 0; // 设置小时
// rule.minute = 0; // 设置分钟

// const jobSchedule = schedule.scheduleJob(rule, job);

