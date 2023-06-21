const puppeteer = require("puppeteer");
const fs = require("fs");
const tencentcloud = require("tencentcloud-sdk-nodejs-ocr");
const readlineSync = require("readline-sync");
const { cookies, sleep, writeFile } = require("./utils");
const OcrClient = tencentcloud.ocr.v20181119.Client;

const defaultSaveDir = "./output/";
const defaultBookName = "番茄小说";

// 实例化一个认证对象，入参需要传入腾讯云账户 SecretId 和 SecretKey，此处还需注意密钥对的保密
// 代码泄露可能会导致 SecretId 和 SecretKey 泄露，并威胁账号下所有资源的安全性。以下代码示例仅供参考，建议采用更安全的方式来使用密钥，请参见：https://cloud.tencent.com/document/product/1278/85305
// 密钥可前往官网控制台 https://console.cloud.tencent.com/cam/capi 进行获取
const clientConfig = {
  credential: {
    secretId: "AKIDgnv78xb7RbcS7f3GPV9duxoESTSGtOhw",
    secretKey: "WXO5Y5RchdZN6g5wpvseCakiT2nNtJzd",
  },
  region: "ap-beijing",
  profile: {
    httpProfile: {
      endpoint: "ocr.tencentcloudapi.com",
    },
  },
};

// 实例化要请求产品的client对象,clientProfile是可选的
const client = new OcrClient(clientConfig);

const ocrText = async () => {
  const image = fs.readFileSync("./example.jpg").toString("base64");
  const params = { ImageBase64: image };
  let res;
  await client.GeneralBasicOCR(params).then(
    (data) => {
      res = data;
    },
    (err) => {
      console.error("error", err);
    }
  );
  return res;
};

(async () => {
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
    `请输入小说存放资料夹(预设: ${defaultSaveDir})/${defaultBookName}: `
  );

  let bookname = readlineSync.question(
    `请输入小说名称(预设: ${defaultSaveDir})/${defaultBookName}: `
  );
  if (dir === "") {
    dir = defaultSaveDir;
  }
  if (bookname === "") {
    bookname = defaultBookName;
  }
  console.log("书名：:", bookname);

  let mergeable;
  if (readlineSync.keyInYN("请选择是否合并所有章节至单独文件?y/N(N)")) {
    mergeable = true;
  } else {
    mergeable = false;
  }
  console.log("是否合并章节", mergeable);

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

  if (cookies) await setCookie(page, cookies, (verbose = debug));

  console.log("标签页已启动, 开始爬取小说内容...");

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage();
  await page.setViewport({
    height: 6000,
    width: 1000,
    // isMobile: true,
  });

  await page.goto(url).catch((err) => {
    console.error(
      ` #####! <-- ${dir} 第 1 章 访问失败 !!!!!  退出程序...######`
    );
    console.log(` url为: ${url} \n`);
    console.log(err);
    return;
  });

  for (let pageNum = startIndex; pageNum <= endIndex; pageNum++) {
    await page.screenshot({ path: "example.jpg" });
    await sleep(500);

    const result = await ocrText();

    const data = result.TextDetections.map((item) => item.DetectedText).join(
      "\n"
    );

    if (!mergeable) {
      writeFile(
        `${dir}`,
        `${pageNum.toString().padStart(2, "0")}.txt`,
        data,
        ` --> ${dir} 第${pageNum}章 已储存\n`,
        ` #####! <-- ${dir}/ 第${pageNum}章: 写入错误或data为空 !!!!!  退出程序...######`
      );
    } else {
      writeFile(
        `${dir}`,
        `${bookname}.txt`,
        `${data.replaceAll("    ", "\n")}\n\n`,
        ` --> ${dir} 第${pageNum}章 已儲存\n`,
        ` #####! <-- ${dir}/ 第${pageNum}章: 写入错误或data为空 !!!!!  退出程序...######`,
        1,
        "a+"
      );
    }

    // let contentPageData = null;

    await page.evaluate(() => {
      // let content = [...document.querySelectorAll("#html_0 div p")]
      //   .map((item) => item.innerText.trim())
      //   .join("\n");
      // let title = document.querySelector("#html_0 .body-title").innerText;
      // return { title, content };

      let a = document.querySelector(".muye-reader-btns .next");
      a.click();
    });

    // await page.evaluate(() => {
    //   let content = document.querySelector("#html_0");
    //   content.click();
    //   let footBtn = document.querySelector(".menu-item.progress");
    //   footBtn.click();
    //   let nextChapter = document.querySelector(".chapter-range-text.next");
    //   nextChapter.click();
    // });
  }

  await browser.close();
})();

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
