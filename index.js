const fs = require("fs");
const puppeteer = require("puppeteer");
const Hjson = require("hjson");
const readlineSync = require("readline-sync");
const {
  cookies,
  sleep,
  sanitizeCookie,
  findBookSourceByHost,
  writeFile,
  sanitizeFileName,
} = require("./utils");

const VERSION = "1.0.0";

// puppeteer config
const config = (function (filePath) {
  let configFile = null;
  if (!fs.existsSync(filePath)) {
    console.log(">> 配置文件不存在, 创建默认配置文件...");
    configFile = fs.readFileSync("./config.hjson.template", "utf8");
    fs.writeFileSync(filePath, configFile, "utf8");
  } else configFile = fs.readFileSync(filePath, "utf8");

  return Hjson.parse(configFile);
})("./config.hjson");

const maxReloadCount = config.maxReloadCount;
const maxRetryCount = config.maxRetryCount;
const defaultSaveDir = config.defaultSaveDir;
const debug = config.debug;
const browserLaunchOptions = config.browserLaunchOptions;

const main = async () => {
  console.log("\nNovel-Crawler 爬虫 v" + VERSION);
  let url = readlineSync.question("请输入开始章节网址: ");
  if (url == "") {
    console.log("url为空，退出程序...");
    return;
  }

  let startIndex = readlineSync.question("请输入起始章节（1）: ");
  let endIndex = readlineSync.question("请输入结束章节（2000）: ");
  if (startIndex == "") startIndex = 1;
  if (endIndex == "") endIndex = 2000;

  let dir = readlineSync.question(
    `请输入小说存放资料夹(预设: ${defaultSaveDir})/书名: `
  );
  if (dir == "") {
    dir = defaultSaveDir;
  }
  let mergeable;
  if (readlineSync.keyInYN("请选择是否合并所有章节至单独文件?y/N(N)")) {
    mergeable = true;
  } else {
    mergeable = false;
  }
  console.log("是否合并章节", mergeable);

  let bookSourceName;

  bookSourceName = readlineSync.question(
    "请指定书源文件, 不指定则根据url自动匹配: "
  );
  console.log(`书源文件: ${"./bookSource/" + bookSourceName}`);

  return await getBook(
    url,
    startIndex,
    endIndex,
    dir,
    bookSourceName,
    mergeable
  );
};

/**
 *
 * @param {*} url
 * @param {*} startIndex
 * @param {*} endIndex
 * @param {*} dir
 * @param {*} bookSourceName
 * @param {*} mergeable
 * @returns
 */
const getBook = async (
  url,
  startIndex,
  endIndex,
  dir,
  bookSourceName,
  mergeable
) => {
  console.log("获取书籍信息, 启动浏览器...");

  const browser = await puppeteer.launch(browserLaunchOptions);

  let bookSourcePath = null;
  if (bookSourceName == "" || !bookSourceName) {
    console.log("未指定书源文件，根据url自动匹配...");
    try {
      bookSourcePath = await deduceBookSourceFromUrl(url, "./bookSource");
    } catch (error) {
      console.log(">> 根据url自动匹配书源失败，退出程序... <<");
      console.log(error);
      return;
    }
  } else {
    bookSourcePath = "./bookSource/" + bookSourceName;
  }

  console.log(">> 获取书源...");
  console.log(">> 书源文件: " + bookSourcePath);
  bookSource = Hjson.parse(fs.readFileSync(bookSourcePath, "utf8"));
  console.log(
    `>> 书源已确定: "${bookSource.bookSourceName}", "${bookSource.bookSourceUrl}"`
  );

  bookSource.getBookID = new Function(
    bookSource.getBookID.arguments,
    bookSource.getBookID.body
  );
  bookSource.getHomeUrl = new Function(
    bookSource.getHomeUrl.arguments,
    bookSource.getHomeUrl.body
  );
  bookSource.formatContentText = new Function(
    bookSource.formatContentText.arguments,
    bookSource.formatContentText.body
  );

  console.log(">> 书源初始化完成\n");
  if (bookSource.note) console.log("书源信息: \n" + bookSource.note + "\n");

  console.log("启动浏览器, 获取书籍信息...");

  let bookInfo = await getBookInfo(browser, bookSource, url);
  let bookname = bookInfo.bookname;

  bookInfo.bookSourceVersion = bookSource.version;
  bookInfo.crawlerVersion = `pyx/novel-crawler:v${VERSION}`;

  console.log("书籍信息:\n" + JSON.stringify(bookInfo, null, 4));

  if (dir[dir.length - 1] != "/") {
    dir += "/";
  }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.log(`\n >> 资料夹不存在，将会自动创建此目录: (${dir})`);
  }
  dir += bookname + "/";
  console.log(`\n >> 小说将存储到: (${dir})`);

  startIndex = parseInt(startIndex);
  endIndex = parseInt(endIndex);

  {
    n = readlineSync.question("按任意键继续... 输入 n 退出");
    if (n == "n") {
      console.log("退出程序...");
      browser.close();
      return;
    }
  }

  try {
    fs.mkdirSync(`${dir}`, { recursive: true });
    console.log(`创建目录"${dir}"成功。`);
  } catch (error) {
    if (error.code == "EEXIST") console.log("目录已存在，无需创建。");
    else {
      console.log("创建目录失败，未知错误... 打印错误信息:");
      console.log(error);
    }
  }

  if (startIndex <= 1) {
    console.log("创建 000 介绍文件...");

    writeFile(
      `${dir}`,
      `000.txt`,
      JSON.stringify(bookInfo, null, 4),
      ` --> ${bookInfo.bookname} / 000 介绍文件 已储存\n`,
      ` #####! <-- 000 介绍文件写入错误 !!!!!  退出程序...######\n`
    );
  }

  const page = await browser.newPage();

  if (cookies) await setCookie(page, cookies, (verbose = debug));

  console.log("标签页已启动, 开始爬取小说内容...");

  let lastPageData = null;
  for (pageNum = startIndex; pageNum <= endIndex; pageNum++) {
    if (!url || url == "") {
      console.error(
        ` #####! <-- ${dir} 第${pageNum}章 url为空 !!!!!  退出程序...######`
      );
      console.log(` url为: "${url}" index 为: ${pageNum}\n`);
      break;
    }

    await page.goto(url).catch((err) => {
      console.error(
        ` #####! <-- ${dir} 第${pageNum}章 访问失败 !!!!!  退出程序...######`
      );
      console.log(` url为: ${url} index 为: ${pageNum}\n`);
      console.log(err);
      return;
    });

    let contentPageData = null;

    for (
      let errCount = 0, reloadCount = 0;
      errCount < maxRetryCount && reloadCount < maxReloadCount;
      errCount++
    ) {
      try {
        await sleep(800 * errCount);
        contentPageData = await page.evaluate((bookSource) => {
          bookSource.getContent = new Function(
            bookSource.getContent.arguments,
            bookSource.getContent.body
          );
          return bookSource.getContent(document);
        }, bookSource);
        contentPageData.content = bookSource.formatContentText(
          contentPageData.content
        );
        if (!contentPageData.title || contentPageData.title == "")
          throw "title为空";
      } catch (err) {
        if (page.url() == bookInfo.homeUrl) {
          console.log(
            " #####! <-- 爬取完毕, 本页是目录页: home url.  退出程序...######"
          );
          return;
        }
        if (errCount >= maxRetryCount - 1) {
          console.error(
            ` #####! <-- ${dir} 第${pageNum}章 爬取失敗 !!!!!  退出程序...######`
          );

          console.log("\n #####! <-- 爬取错误, contentPageData:");
          console.log(contentPageData);
          console.log(" #####! vvv-- 报错信息:");
          console.log(err);

          if (reloadCount < maxReloadCount - 1) {
            console.log(
              ` #####! <-- 重新加载页面 ${
                reloadCount + 2
              }/${maxReloadCount} 次...`
            );
            reloadCount++;
            errCount = -1;
            continue;
          }

          console.log(
            "可能是抵达最后一页, 但并未检测成功, 或是书源中的 getContent 函数报错, 请检查书源文件是否正确"
          );
          console.log(` url为: ${url} index 为: ${pageNum}`);
          await browser.close();
          return;
        }

        if (debug) {
          console.log("\n #####! <-- 爬取错误, contentPageData:");
          console.log(contentPageData);
          console.log(" #####! vvv-- 报错信息:");
          console.log(err);
        }
        console.error(
          ` #####! <-- ${dir} 第${pageNum}章 爬取失败，正在重试... ${
            errCount + 1
          }/10\n`
        );
        continue;
      }

      break;
    }

    if (!contentPageData) {
      console.error(
        ` #####! <-- ${dir} 第${pageNum}章 爬取失败 !!!!! contentPageData 为空 退出程序...######`
      );
      console.log(` url为: ${url} index 为: ${pageNum}`);
      console.log(
        `上一个页面的数据为: ${JSON.stringify(lastPageData, null, 4)}`
      );
      break;
    }
    if (!contentPageData.content || !contentPageData.title) {
      console.error(
        ` #####! <-- ${dir} 第${pageNum}章 爬取失敗 !!!!! contentPageData 小说正文/标题/下一页url爬取失败  退出程序...######`
      );
      console.log(` url为: ${url} index 为: ${pageNum}`);
      console.log(
        `contentPageData 为 ${JSON.stringify(contentPageData, null, 4)}`
      );
      console.log(
        `上一个页面的数据为: ${JSON.stringify(lastPageData, null, 4)}`
      );
    }

    if (lastPageData && contentPageData.title == lastPageData.title) {
      console.log(
        ` <-- ! ${dir} 第${pageNum}章: ${contentPageData.title} - 于上一章 ${
          pageNum - 1
        } 标题相同, 写入同一个文件`
      );
      contentPageData.content =
        lastPageData.content + "\n" + contentPageData.content;
      pageNum--;
    }

    if (!mergeable) {
      writeFile(
        `${dir}`,
        `${pageNum.toString().padStart(2, "0")} ${contentPageData.title}.txt`,
        contentPageData.content,
        ` --> ${dir} 第${pageNum}章: ${contentPageData.title} 已储存\n`,
        ` #####! <-- ${dir}/ 第${pageNum}章: 写入错误或data为空 !!!!!  退出程序...######`
      );
    } else {
      writeFile(
        `${dir}`,
        `${bookInfo.bookname}.txt`,
        `${contentPageData.title}\n  ${contentPageData.content.replaceAll(
          "    ",
          "\n"
        )}\n\n`,
        ` --> ${dir} 第${pageNum}章: ${contentPageData.title} 已儲存\n`,
        ` #####! <-- ${dir}/ 第${pageNum}章: 写入错误或data为空 !!!!!  退出程序...######`,
        1,
        "a+"
      );
    }

    if (
      !contentPageData.nextPageUrl ||
      contentPageData.nextPageUrl == bookInfo.homeUrl
    ) {
      console.log(
        ` #####! <-- 爬取完毕. 下一页url不存在或下一页是返回目录页\n 下一页url = "${contentPageData.nextPageUrl}"  退出程序...######`
      );
      break;
    }
    url = contentPageData.nextPageUrl;
    lastPageData = contentPageData;
  }

  await browser.close();

  console.log(" --- 任务完成 --- ");
};

/**
 *
 * @param {*} url
 * @param {*} bookSourceDir
 * @returns
 */
const deduceBookSourceFromUrl = async (url, bookSourceDir) => {
  url = new URL(url);

  let host = url.hostname.replace("www.", "");

  let bookSource = findBookSourceByHost(bookSourceDir, host)[0];
  if (!bookSource || bookSource == "") {
    console.error(" #####! <-- 未找到匹配的小说源, 退出程序...######");
    return null;
  }
  return bookSource;
};

const getBookInfo = async (browser, bookSource, chapterUrl) => {
  console.log(" --- 正在获取小说信息 --- ");
  let homeUrl = bookSource.getHomeUrl(bookSource.getBookID(chapterUrl));
  console.log("书籍首页：", homeUrl);

  const page = await browser.newPage();
  await page.goto(homeUrl);

  let data = null;

  try {
    data = await page.evaluate((bookSource) => {
      bookSource.getBookInfo = new Function(
        bookSource.getBookInfo.arguments,
        bookSource.getBookInfo.body
      );

      return bookSource.getBookInfo(document);
    }, bookSource);
  } catch (err) {
    console.error(` #####! <-- 000 介绍文件 爬取失敗，正在报错...`);
    console.error(
      ` #####! <-- 可能是书源中的 getBookInfo 函数报错, 请检查书源文件是否正确`
    );
    console.error(` #####! <-- 接下来打印报错信息: \n\n`);
    throw err;
  }
  data.homeUrl = homeUrl;
  data.intro = convertToPlainText(data.intro);

  page.close();
  return data;
};

const convertToPlainText = (str) => {
  try {
    str = str.replace(/<br\s*\/?>/g, "\n");
    str = str.replace(/&nbsp;/g, "");
  } catch (err) {
    console.log(err);
  }
  return str;
};

const setCookie = async (page, cookies, verbose = false) => {
  if (verbose) console.log("\n>> 正在设置cookie...");
  for (let cookie of cookies) {
    if (!cookie.value) {
      if (verbose)
        console.log(`>> 跳过cookie: ${JSON.stringify(cookie)} 因为value为空.`);
      continue;
    }
    await page.setCookie(sanitizeCookie(cookie, verbose));
  }
};

main();
