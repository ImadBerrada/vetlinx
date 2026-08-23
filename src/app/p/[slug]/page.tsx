import { PublicPortfolio } from "@/components/portfolio/PublicPortfolio";

export default async function PublicPortfolioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicPortfolio slug={slug} />;
}
