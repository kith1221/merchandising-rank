"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  TrendingUp, 
  Tags, 
  Settings,
  ShoppingCart,
  MapPin,
  Store,
  Shirt,
  Info,
  Upload,
  Brain
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Overview", href: "/", icon: <LayoutDashboard size={20} /> },
    { name: "Upload Data", href: "/upload", icon: <Upload size={20} /> },
    { name: "Purchasing", href: "/purchasing", icon: <ShoppingCart size={20} /> },
    { name: "Smart Allocation", href: "/allocation", icon: <MapPin size={20} /> },
    { name: "Forecasting", href: "/forecasting", icon: <TrendingUp size={20} /> },
    { name: "Markdown", href: "/markdown", icon: <Tags size={20} /> },
    { name: "Store Network", href: "/store-network", icon: <Store size={20} /> },
    { name: "AI Insights", href: "/ai-insights", icon: <Brain size={20} /> },
    { name: "Apparel & Jersey", href: "/apparel", icon: <Shirt size={20} /> },
    { name: "About System", href: "/about", icon: <Info size={20} /> },
    { name: "Settings", href: "/settings", icon: <Settings size={20} /> },
  ];

  return (
    <aside className="sidebar glass-panel">
      <div className="brand">
        <div className="brand-dot"></div>
        RANK SPORTS
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '-24px', marginBottom: '16px', fontWeight: 600 }}>
        PT Rank Retailindo Atletik
      </div>
      <nav className="nav-menu mt-8">
        {navItems.map((item) => (
          <Link 
            key={item.name} 
            href={item.href}
            className={`nav-item ${pathname === item.href ? 'active' : ''}`}
          >
            {item.icon} {item.name}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
