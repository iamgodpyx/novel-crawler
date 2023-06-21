const fs = require("fs");
const path = require("path");
const Hjson = require("hjson");

// puppeteer设置cookie
const cookies = (function (cookieFilePath) {
  if (
    fs.existsSync(cookieFilePath) &&
    fs.statSync(cookieFilePath).isFile() &&
    fs.readFileSync(cookieFilePath, "utf8").trim() != ""
  ) {
    return require(cookieFilePath);
  } else {
    console.log(">> cookie.json 不存在, 跳过设置cookie...");
    return null;
  }
})("./cookie.json");

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const sanitizeCookie = (cookie, verbose = false) => {
  if (verbose) console.log(`\n>> 正在清理cookie: ${JSON.stringify(cookie)}`);
  for (const key in cookie) {
    if (cookie.hasOwnProperty(key)) {
      if (
        cookie[key] === null ||
        cookie[key] === undefined ||
        cookie[key] === ""
      ) {
        if (verbose)
          console.log(`>> 删除cookie中的 '${key}' 属性: 属性值为空.`);
        if (key === "value" && typeof cookie[key] !== "string") {
          if (verbose)
            console.log(`>> 跳过 '${key}' 属性, 因为此属性必须存在且为string.`);
          continue;
        }
        delete cookie[key];
      }
    }
  }
  if (verbose) console.log(`\n>> cookie清理完成\n`);
  return cookie;
};

const findBookSourceByHost = (dir, host) => {
  const files = fs.readdirSync(dir);
  const result = [];

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      result.push(...findBookSourceByHost(filePath, host));
    } else if (stat.isFile() && path.extname(file) === ".hjson") {
      const currentBookSource = Hjson.parse(fs.readFileSync(filePath, "utf8"));

      if (currentBookSource.bookSourceUrl.indexOf(host) !== -1) {
        return result.push(filePath);
      }
    }
  });

  return result;
};

const writeFile = (
  dir,
  fileName,
  data,
  successMessage,
  errMessage,
  attempts = 1,
  flag = "w"
) => {
  fs.writeFile(
    `${dir}${sanitizeFileName(fileName)}`,
    data,
    { flag },
    function (err) {
      if (err) {
        console.log(errMessage);
        console.log(err);
        if (attempts >= 10) {
          console.log(` #####! --- 写入错误, 第10重试失敗, 退出程序... ######`);
          return false;
        } else {
          console.log(
            ` #####! --- 写入错误, 正在重试: ${attempts + 1}/10 ######`
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
    }
  );
};

const sanitizeFileName = (str) => {
  return str.replace(/[\\/:*?"<>|]/g, "_");
};

module.exports = {
  cookies,
  sleep,
  sanitizeCookie,
  findBookSourceByHost,
  writeFile,
  sanitizeFileName,
};
