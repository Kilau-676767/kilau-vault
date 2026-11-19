# Serverless 边缘计算

```mermaid
graph LR
  User[用户] --> Edge[Cloudflare Workers 边缘节点]
  Edge --> D1[(D1 SQLite)]
```

边缘计算将计算推向离用户最近的节点，极大降低网络延迟。参见 [[分布式系统与CAP定理]] 与 [[计算机科学索引]]。

#架构 #Cloudflare
