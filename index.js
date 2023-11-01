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
// 获取新闻，每天早上九点更新
async function getNews(){
  const browser = await puppeteer.launch(launchParameters);
  async function recursiveCallCreatePage() {
    const page = await browser.newPage();
    await page.goto('https://news.ifeng.com/',  { timeout: 120000 });
    const news_one = await page.$$eval('.news_item > a', elements => {
      const imgs = elements.map(ele => {
        return ele.querySelector('img').src;
      })
      return elements.map((e, i) => ({title: e.title, href: e.href, img: imgs[i]}));
    });
    const news_two = await page.$$eval('.news_list a', elements => {
      return elements.map(ele => ({title: ele.title, href: ele.href, img: ''}));
    });
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

