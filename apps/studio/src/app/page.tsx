import Link from "next/link";

export default function StudioHomePage() {
  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Studio navigation">
        <div>
          <p className="eyebrow">industry research</p>
          <h1>行业研究生产台</h1>
        </div>
        <nav className="nav">
          <Link className="navItem active" href="/industry-research">
            行业研究生产台
          </Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Industry Research Product Line</p>
            <h2>电商竞品研究工作台</h2>
          </div>
          <Link className="primaryButton" href="/industry-research">
            进入工作台
          </Link>
        </header>

        <section className="stats" aria-label="Project stats">
          <div className="stat">
            <span>模板</span>
            <strong>电商竞品研究</strong>
          </div>
          <div className="stat">
            <span>运行方式</span>
            <strong>9router</strong>
          </div>
          <div className="stat">
            <span>采集方向</span>
            <strong>public web</strong>
          </div>
        </section>

        <section className="panel compactPanel">
          <div>
            <p className="eyebrow">Scope</p>
            <h3>当前边界</h3>
          </div>
          <p>
            第一版聚焦电商竞品研究：公开搜索发现、robots/sitemap/RSS/Shopify
            公开路径探测、结构化抽取、人工审核和 Markdown 报告生成。
          </p>
        </section>
      </section>
    </main>
  );
}
