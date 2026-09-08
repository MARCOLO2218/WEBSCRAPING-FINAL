import type { VisualScraperEngine } from '../shared/visual-engine.js';

export const GT_VISUAL_STORE_URLS = {
  laCuracao: 'https://www.lacuracaonline.com/guatemala/c/muebles/camas-y-colchones',
  elektra: 'https://www.elektra.com.gt/cama%20king/camas?map=ft,departamento',
  cemaco: 'https://www.cemaco.com/busqueda?q=camas&indexName=cemaco',
  dormilandia: 'https://www.dormilandia.com.gt/buscador.asp',
} as const;

export function createGuatemalaVisualStores(engine: VisualScraperEngine) {
  return {
    laCuracao: (page: Parameters<VisualScraperEngine['scrapeGenericGuatemalaStore']>[0], scrapedAt: string) =>
      engine.scrapeGenericGuatemalaStore(page, scrapedAt, GT_VISUAL_STORE_URLS.laCuracao, 'La Curacao Guatemala', 'La Curacao'),
    elektra: (page: Parameters<VisualScraperEngine['scrapeGenericGuatemalaStore']>[0], scrapedAt: string) =>
      engine.scrapeGenericGuatemalaStore(page, scrapedAt, GT_VISUAL_STORE_URLS.elektra, 'Elektra Guatemala', 'Elektra'),
    cemaco: (page: Parameters<VisualScraperEngine['scrapeGenericGuatemalaStore']>[0], scrapedAt: string) =>
      engine.scrapeGenericGuatemalaStore(page, scrapedAt, GT_VISUAL_STORE_URLS.cemaco, 'Cemaco Guatemala', 'Cemaco'),
    dormilandia: (page: Parameters<VisualScraperEngine['scrapeGenericGuatemalaStore']>[0], scrapedAt: string) =>
      engine.scrapeGenericGuatemalaStore(page, scrapedAt, GT_VISUAL_STORE_URLS.dormilandia, 'Dormilandia Guatemala', 'Dormilandia'),
  };
}
