# 配对观察

独立复现 Bo 视频中的 VTV／QQQ、CGDV／QQQ 30／35 日配对曲线。

网址：https://ethanyhou.github.io/bo-pair-observer/

页面提供曲线筛选、QQQ 价格背景、Risk On／Risk Off 日期与操作解释、区间切换及离线保存。

## 行情更新

GitHub Actions 在每个周一至周五美东 16:37 更新、18:17 补查，时区设置随纽约夏令时切换。GitHub 定时任务可能延迟；页面打开时及每 5 分钟检查最新发布的数据。手动点击“检查更新”读取已发布快照。

需要主动抓取新行情时，在仓库的 Actions 页面选择 **Update prices and deploy Pages → Run workflow**。

仅使用已经收盘的完整日线，含拆股调整，不做分红复权；当天行情在常规收盘 15 分钟后才纳入。三个标的采用共同有效截止日。Yahoo 接口失败时重试；持续失败时保留之前的数据并在页面显示警告。超过 5 个日历日的旧行情暂停操作参考。

下载的数据和最近一次抓取状态会由 Actions 提交回仓库，避免失败时丢失有效快照。这里没有实时盘中报价服务。

## 本地构建

Python 3.9 或更新版本，无第三方依赖：

```sh
python3 build_site.py --offline
python3 -m http.server 8000 --directory dist
```

主动抓取并构建：`python3 build_site.py`。允许失败时使用之前的数据：`python3 build_site.py --allow-cached`。

`src/` 是完整源码；`src/evidence/video_observations.json` 保存可读画面值与日期的观察记录。`dist/` 为生成的网站，不纳入版本控制。

## 指标解释

默认公式为防御资产／QQQ 价格比的 30 或 35 个交易日 ROC；确认规则为连续两日同侧且当日继续同向，状态改变时标记一次。Risk On 为负向确认，Risk Off 为正向确认。过滤规则是独立复现推断，有限样本核对不能证明源码完全相同。

仓位示例和 QQQ／TQQQ／BOXX 的操作解释是依据公开视频做出的改写，页面注明来源与适用范围；它不是 Bo 公布的固定三基金交易系统，没有连接券商或下单。

部署参考：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
