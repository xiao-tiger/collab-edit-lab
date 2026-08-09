// Nextra v3 要求的自定义 App 组件：主题 Layout 由 Nextra 自动注入，这里保持纯粹
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
