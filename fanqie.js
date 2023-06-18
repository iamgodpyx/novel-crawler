const puppeteer = require("puppeteer");
const fs = require("fs");
const tencentcloud = require("tencentcloud-sdk-nodejs-ocr");

const OcrClient = tencentcloud.ocr.v20181119.Client;

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
  const params = { ImageBase64: image};
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

// // 设置APPID/AK/SK
// const APP_ID = "34877787";
// const API_KEY = "sA2vCFE2cgGtgKfZm49rqDaX";
// const SECRET_KEY = "8092G3SMILn0TRui3w9MfYjvm6z0TXf8";

// // 新建一个对象，建议只保存一个对象调用服务接口
// const client = new AipOcrClient(APP_ID, API_KEY, SECRET_KEY);

// const ocrTextTest = async () => {
//   const options = { detect_direction: true };
//   images("example.jpg").size(500, 3000).save("ocr.jpg", { quality: 100 });

//   // 识别本地图片
//   const image = fs.readFileSync("./ocr.jpg").toString("base64");
//   let result = client.generalBasic(image, options);
//   return result;

//   // 识别在线图片
//   // const result = await client.generalBasicUrl(
//   //   "https://lzw.me/wp-content/uploads/2017/02/donate_wx.png"
//   // );
// };

(async () => {
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
  await page.goto(
    "https://fanqienovel.com/reader/7081837085425926656?enter_from=page"
  );

  for (let i = 0; i < 10; i++) {
    await page.screenshot({ path: "example.jpg" });
    await sleep(1000);

    const result = await ocrText();

    const data = result.TextDetections.map(item => item.DetectedText).join('\n');

    console.log(123123, data);

    // 寫入檔案
    //          (目录位置/, 檔案名稱, 檔案內容, 成功訊息, 失敗訊息)
    writeFile(
      "download/",
      `第${i + 1}章.txt`,
      data,
      ` --> 第${i + 1}章 已储存\n`,
      ` #####! <--  写入错误或data为空 !!!!!  退出程序...######`
    );

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

const getNovel = async () => {
  let contentPageData = null;

  contentPageData = await page.evaluate(() => {
    let content = [...document.querySelectorAll("#html_0 div p")]
      .map((item) => item.innerText.trim())
      .join("\n");
    let title = document.querySelector("#html_0 body-title").innerText;
    return { title, content };
  });

  // 寫入檔案
  //          (目录位置/, 檔案名稱, 檔案內容, 成功訊息, 失敗訊息)
  writeFile(
    `download`,
    `${contentPageData.title}.txt`,
    contentPageData.content,
    ` --> ${dir} 第${pageNum}章: ${contentPageData.title} 已储存\n`,
    ` #####! <-- ${dir}/ 第${pageNum}章: 写入错误或data为空 !!!!!  退出程序...######`
  );

  await page.touchscreen.touchmove(0, 400);
};

// 封装fs.writeFile, 如果写入错误, 递归重试10次
// dir: 檔案目录, fileName: 檔案名稱, data: 檔案內容,
// successMessage: 成功訊息, errMessage: 失敗訊息,
// attempts: 重試次數, 调用时不用传参, flag: 文件写入方式,默认w覆盖模式,合并TXT时使用追加模式
function writeFile(
  dir,
  fileName,
  data,
  successMessage,
  errMessage,
  attempts = 1,
  flag = "w"
) {
  // 如果失败, 重試10次
  fs.writeFile(`${dir}${fileName}`, data, { flag }, function (err) {
    if (err) {
      console.log(errMessage);
      console.log(err);
      if (attempts >= 10) {
        console.log(` #####! --- 写入錯誤, 第10重试失敗, 退出程序... ######`);
        return false;
      } else {
        console.log(
          ` #####! --- 写入錯誤, 正在重试: ${attempts + 1}/10 ######`
        );
        return writeFile(
          dir,
          fileName,
          data,
          successMessage,
          errMessage,
          attempts + 1
        );
      }
    }
    console.log(successMessage);
    return true;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
