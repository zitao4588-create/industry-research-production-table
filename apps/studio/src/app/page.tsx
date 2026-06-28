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
            电商竞品研究
          </Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">AI 竞品研究</p>
            <h2>帮你做电商竞品研究，一键生成报告</h2>
          </div>
          <Link className="primaryButton" href="/industry-research">
            开始研究
          </Link>
        </header>

        <section className="stats" aria-label="How it works">
          <div className="stat">
            <span>第一步</span>
            <strong>输入品类</strong>
          </div>
          <div className="stat">
            <span>第二步</span>
            <strong>自动研究</strong>
          </div>
          <div className="stat">
            <span>第三步</span>
            <strong>得到报告</strong>
          </div>
        </section>

        <section className="panel compactPanel">
          <div>
            <p className="eyebrow">它能做什么</p>
            <h3>从一个品类到一份报告</h3>
          </div>
          <p>
            输入一个品类、行业或竞品，系统会自动找公开资料、整理竞品、提炼机会，
            最后生成一份可下载的研究报告。无需配置，点开就能用。
          </p>
        </section>
      </section>
    </main>
  );
}
