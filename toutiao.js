const CryptoJS = require("crypto-js");
const axios = require("axios");
const puppeteer = require("puppeteer");
const readlineSync = require("readline-sync");

const start_url = "https://m.toutiao.com/list/?tag=__all__&max_time=";
const url = "https://toutiao.com";

const user_url =
  "https://profile.zjurl.cn/api/feed_backflow/profile_share/v1/?app_name=news_article&category=profile_all&stream_api_version=82&request_source=1&appId=1286&appType=mobile_detail_web&isAndroid=true&isIOS=false&isMobile=true&cookie_enabled=true&screen_width=375&screen_height=762&browser_language=zh-CN&browser_platform=MacIntel&browser_name=firefox&browser_version=114.0.0.0&browser_online=true&timezone_name=Asia%2FShanghai";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "Cache-Control:": "no-cache",
  Connection: "keep-alive",
  Host: "m.toutiao.com",
  Pragma: "no-cache",
  "Sec-Ch-Ua":
    '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": "macOS",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};
const cookies = {
  tt_webid: "7072661175557015053",
};

const puppeteerCookies = {
  value: "7072661175557015053",
  name: "tt_webid",
  domain: "m.toutiao.com",
};

let max_behot_time = "0"; // 链接参数
const source_url = []; // 存储新闻的链接
const s_url = []; // 存储新闻的完整链接
const media_url = []; // 存储公众号的完整链接

const title = []; // 存储新闻标题
const comment_count = []; // 存储评论量
const like_count = []; // 点赞数
const event_url = []; // 新闻链接
const source = []; // 存储发布新闻的公众号
const uid = []; // uid
const items = []; // 聚合数据

let offset = "0";

// const saveDate = () => {};

const getAsCp = () => {
  let result = {};
  let now = Math.floor(Date.now() / 1000);
  // let now = 1686993969;
  console.log("now:", now);
  let now_16 = now.toString(16).toUpperCase();
  console.log("now_16:", now_16);

  let md5 = CryptoJS.MD5(String(now)).toString().toUpperCase();

  console.log("md5:", md5);

  if (now_16.length !== 8) {
    result = { as: "479BB4B7254C150", cp: "7E0AC8874BB0985" };
    return result;
  }

  let first_string = md5.slice(0, 5);
  let second_string = md5.slice(-5);
  let first_result_string = "";
  let second_result_string = "";

  for (let i = 0; i < 5; i++) {
    first_result_string += now_16[i + 3] + second_string[i];
    second_result_string += first_string[i] + now_16[i];
  }

  result = {
    as: "A1" + second_result_string + now_16.slice(-3),
    cp: now_16.slice(0, 3) + first_result_string + "E1",
  };

  console.log("ascp:", result);
  return result;
};

const getData = async (url, headers, cookies) => {
  const resp = await axios.get(url, {
    headers: {
      headers,
      Cookie: cookies,
    },
  });

  console.log("url:", url);

  const data = resp.data;
  return data;
};

const sleep = (time) => {
  return new Promise((res) => {
    setTimeout(() => {
      res();
    }, time);
  });
};

// 接口请求爬取
const main = async (
  max_behot_time,
  title,
  source_url,
  s_url,
  source,
  media_url,
  comment_count
) => {
  let crawlerTimes = readlineSync.question("请输入feed流爬取次数（100）: ");
  if (crawlerTimes == "") crawlerTimes = 100;
  for (let i = 0; i < crawlerTimes; i++) {
    const ascp = getAsCp();

    let res = await getData(
      start_url +
        max_behot_time +
        "&max_behot_time=" +
        max_behot_time +
        "&as=" +
        ascp["as"] +
        "&cp=" +
        ascp["cp"] +
        "&ac=wap&count=20&format=json_raw&aid=1698&_signature=",
      headers,
      cookies
    );

    await sleep(3000);

    for (let j = 0; j < res.data.length; j++) {
      if (!title.find((item) => item === res["data"][j]["title"])) {
        title.push(res["data"][j]["title"]);
        source_url.push(res["data"][j]["source_url"]);
        source.push(res["data"][j]["source"]);
      }
      if (!"comment_count" in Object.keys(res["data"][j])) {
        res["data"][j]["comment_count"] = 0;
      }
      comment_count.push(Number(res["data"][j]["comment_count"]));
      // if (!media_url.find((item) => item === res["data"][j]["source"])) {
      //   if ("media_url" in Object.keys(res["data"][j])) {
      //     media_url[res["data"][j]["source"]] =
      //       url + res["data"][j]["media_url"];
      //   } else {
      //     media_url[res["data"][j]["source"]] = "";
      //   }
      // }
    }

    console.log("max_behot_time:", max_behot_time);
    max_behot_time = String(res.data[res.data.length - 1]["behot_time"]);

    for (let i = 0; i < title.length; i++) {
      console.log("标题：", title[i]);
      if (!source_url[i].startsWith("https")) {
        s_url.push(url + source_url[i]);
        console.log("新闻链接：", url + source_url[i]);
      } else {
        console.lod("新闻链接：", source_url[i]);
        s_url.push(source_url[i]);
      }
      console.log("头条号：", source[i]);
      console.log("评论数：", comment_count[i]);
      console.log(title.length);
    }
  }
};

// main(
//   max_behot_time,
//   title,
//   source_url,
//   s_url,
//   source,
//   media_url,
//   comment_count
// );

// 无头浏览器爬取
const puppeteerAction = async () => {
  let crawlerTimes = readlineSync.question("请输入feed流爬取次数（100）: ");
  if (crawlerTimes == "") crawlerTimes = 100;

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });

  const page = await browser.newPage();
  await page.setViewport({
    height: 890,
    width: 375,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  await page.setCookie(puppeteerCookies);

  for (let i = 0; i < crawlerTimes; i++) {
    const ascp = getAsCp();
    await page.goto(
      start_url +
        max_behot_time +
        "&max_behot_time=" +
        max_behot_time +
        "&as=" +
        ascp["as"] +
        "&cp=" +
        ascp["cp"] +
        "&ac=wap&count=20&format=json_raw&aid=1698&_signature="
    );

    const res = await page.evaluate(async () => {
      return JSON.parse(document.querySelector("pre").innerText);
    });

    await sleep(1000);

    console.log("max_behot_time:", max_behot_time);
    max_behot_time = String(res.data[res.data.length - 1]["behot_time"]);

    for (let j = 0; j < res.data.length; j++) {
      if (!title.find((item) => item === res["data"][j]["title"])) {
        title.push(res["data"][j]["title"]);
        console.log("标题：", res["data"][j]["title"]);

        // source_url.push(res["data"][j]["source_url"]);
        source.push(res["data"][j]["source"]);
        console.log("头条号：", res["data"][j]["source"]);

        event_url.push(res["data"][j]["url"]);
        console.log("新闻链接：", res["data"][j]["url"]);

        if (!"comment_count" in Object.keys(res["data"][j])) {
          comment_count.push(0);
        } else {
          comment_count.push(res["data"][j]["comment_count"]);
        }
        console.log("评论数：", res["data"][j]["comment_count"] || 0);

        if (!"like_count" in Object.keys(res["data"][j])) {
          like_count.push(0);
        } else {
          like_count.push(res["data"][j]["like_count"]);
        }
        console.log("点赞数", res["data"][j]["like_count"] || 0);

        if (!res["data"][j]?.["log_pb"]?.["author_id"]) {
          uid.push("");
        } else {
          uid.push(res["data"][j]?.["log_pb"]?.["author_id"]);
        }
        console.log(
          "作者uid：",
          res["data"][j]?.["log_pb"]?.["author_id"] || ""
        );

        items.push({
          like_count: res["data"][j]["like_count"] || 0,
          uid: res["data"][j]?.["log_pb"]?.["author_id"] || "",
        });
      }
    }

    console.log(title.length);
  }

  items.sort((a, b) => {
    return b.like_count - a.like_count;
  });

  console.log(items);

  await browser.close();
};

const crawlUser = async () => {
  let crawlerTimes = readlineSync.question("请输入大V主页爬取次数（10）: ");
  if (crawlerTimes == "") crawlerTimes = 3;

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });

  const page = await browser.newPage();
  await page.setViewport({
    height: 890,
    width: 375,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  await page.setCookie(puppeteerCookies);

  for (let i = 0; i < crawlerTimes; i++) {
    const url =
      user_url +
      "&visited_uid=" +
      items[0].uid +
      "&user_id=" +
      items[0].uid +
      "&offset=" +
      offset +
      "&_signature=";

    console.log("大V链接：", url);
    await page.goto(url);

    const res = await page.evaluate(async () => {
      return JSON.parse(document.querySelector("pre").innerText);
    });

    await sleep(1000);

    console.log("offset:", offset);
    offset = String(res["offset"]);

    for (let j = 0; j < res.data.length; j++) {
      const result = JSON.parse(res.data[j].content);
      console.log("标题：", result.title);
    }
  }

  await browser.close();
};

(async function () {
  await puppeteerAction();
  await crawlUser();
})();
