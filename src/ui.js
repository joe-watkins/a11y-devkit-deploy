import boxen from "boxen";
import pc from "picocolors";
import ora from "ora";

const bullets = {
  info: pc.cyan("i"),
  warn: pc.yellow("!"),
  error: pc.red("x"),
  success: pc.green("ok")
};

function header(title, subtitle) {
  const line = subtitle ? `${pc.dim(subtitle)}` : "";
  const content = [pc.bold(title), line].filter(Boolean).join("\n");
  console.log(
    boxen(content, {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "cyan"
    })
  );
}

function info(message) {
  console.log(`${bullets.info} ${message}`);
}

function warn(message) {
  console.log(`${bullets.warn} ${message}`);
}

function success(message) {
  console.log(`${bullets.success} ${message}`);
}

function error(message) {
  console.log(`${bullets.error} ${message}`);
}

function startSpinner(text) {
  return ora({ text, spinner: "dots" }).start();
}

function formatPath(value) {
  return pc.dim(value);
}

export {
  header,
  info,
  warn,
  success,
  error,
  startSpinner,
  formatPath
};