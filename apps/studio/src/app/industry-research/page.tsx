import Link from "next/link";
import { IndustryResearchWorkbench } from "./IndustryResearchWorkbench";

export default function IndustryResearchPage() {
  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Studio navigation">
        <div>
          <p className="eyebrow">industry research</p>
          <h1>Agent Studio</h1>
        </div>
        <nav className="nav">
          <Link className="navItem" href="/">
            Agent
          </Link>
          <Link className="navItem" href="/settings">
            全局设置
          </Link>
          <Link className="navItem" href="/process">
            流程交付
          </Link>
          <Link className="navItem active" href="/industry-research">
            行业研究生产台
          </Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Industry Research</p>
            <h2>行业研究生产台</h2>
          </div>
          <Link className="secondaryButton" href="/">
            返回看板
          </Link>
        </header>

        <IndustryResearchWorkbench />
      </section>
    </main>
  );
}
