"""Reglas conservadoras de procedencia; ninguna asignación por nombre solo."""
from dataclasses import dataclass
from urllib.parse import urlsplit, unquote
import re
import unicodedata

RULE_VERSION = '038-origin-v1'
MONEY = {'GT': 'GTQ', 'SV': 'USD', 'HN': 'HNL', 'NC': 'NIO'}
# Pares observados en el informe y configuración de extractores GT.
GENERIC_GT = {
    'americana 2000 guatemala': 'americana2000.com',
    'beds & dreams': 'bedsndreams.com',
    'bodegangas guatemala': 'bodegangasgts.com',
    'cemaco guatemala': 'cemaco.com',
    'dormisuenos guatemala': 'tiendasdormisuenos.com',
    'facenco': 'camasfacenco.com',
}
NATIONAL_GT = {'dormilandia.com.gt', 'elektra.com.gt', 'furniturecity.com.gt',
               'lacolchoneria.com.gt', 'mattress.com.gt', 'max.com.gt', 'walmart.com.gt',
               'gt.siman.com', 'gt.camasuena.com'}
REGIONAL = {'sleepgalleryca.com': {'gt': 'GT', 'sv': 'SV', 'hn': 'HN', 'nc': 'NC'},
            'lacuracaonline.com': {'guatemala': 'GT', 'nicaragua': 'NC',
                                   'honduras': 'HN', 'elsalvador': 'SV'},
            'sertacentroamerica.com': {'guatemala': 'GT'},
            'camasolympiaonline.com': {'gt': 'GT'}}
SOCIAL = {'facebook.com', 'instagram.com', 'youtube.com', 'youtu.be', 'wa.me',
          'pinterest.com', 'tiktok.com', 'shopify.com', 'es.shopify.com'}
NAVIGATION = {'mi-cuenta', 'my-account', 'cart', 'carrito', 'checkout', 'contactenos',
              'contacto', 'trabaja-con-nosotros', 'politicas-de-privacidad',
              'politicas-de-garantia', 'politicas-de-devolucion', 'politicas-de-despacho',
              'preguntas-y-respuestas', 'codigos-postales-de-el-salvador'}


@dataclass(frozen=True)
class Classification:
    status: str
    country: str | None
    reason: str


def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value or '')
                   if unicodedata.category(c) != 'Mn').strip().lower()


def parsed_url(value):
    try:
        url = urlsplit((value or '').strip())
        if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password:
            return None
        if url.port not in (None, 80, 443):
            return None
        host = url.hostname.lower().removeprefix('www.')
        parts = [unquote(part).lower() for part in url.path.split('/') if part]
        if any(part in ('.', '..') or '/' in part or '\\' in part for part in parts):
            return None
        return host, parts
    except ValueError:
        return None


def price_currency(value):
    value = str(value or '').strip()
    if not value:
        return None
    for pattern, currency in ((r'^(?:GTQ|Q)\s*\d', 'GTQ'),
            (r'^(?:USD|\$)\s*\d', 'USD'), (r'^(?:NIO|C\$)\s*\d', 'NIO'),
            (r'^(?:HNL|L)\s*\d', 'HNL')):
        if re.match(pattern, value, re.I):
            return currency
    # Sólo números no prueban moneda. Símbolos no reconocidos tampoco.
    return 'sin_moneda_verificable'


def classify_product(row):
    source = parsed_url(row.get('url_fuente'))
    product = parsed_url(row.get('url_producto'))
    review = lambda reason: Classification('revision', None, reason)
    if not source or not product:
        return review('url_ausente_o_invalida')
    host, parts = product
    if host in SOCIAL:
        return Classification('no_producto', None, 'enlace_social_o_plataforma')
    # Selectores de país y navegación observados en Sleep Gallery no son productos.
    route_parts = parts[1:] if host in REGIONAL else parts
    if host in REGIONAL and (not parts or len(parts) == 1):
        return Classification('no_producto', None, 'enlace_portada_o_pais')
    if route_parts and route_parts[0] in NAVIGATION:
        return Classification('no_producto', None, 'enlace_navegacion')
    if host == 'sleepgalleryca.com' and route_parts:
        if route_parts[0] in {'categoria-producto', 'colchones', 'accesorios',
                'mi-cuenta-2', 'hotel-collection', 'tiendas', 'promociones', 'nuestro-enfoque-y-marcas'}:
            return Classification('no_producto', None, 'enlace_navegacion')
        if route_parts[0] != 'producto' or len(route_parts) < 2:
            return review('ruta_sin_producto_verificado')
    country = None
    if host in REGIONAL:
        if source[0] != host and not (host == 'sleepgalleryca.com' and source[0] == 'paises.sleepgalleryca.com'):
            return review('origen_producto_incompatible')
        country = REGIONAL[host].get(parts[0]) if parts else None
        if not country:
            return review('ruta_regional_no_verificada')
        if source[0] == host and source[1] and source[1][0] in REGIONAL[host]:
            if REGIONAL[host][source[1][0]] != country:
                return review('conflicto_pais_fuente_producto')
        reason = 'ruta_regional_explicita'
    elif host in NATIONAL_GT and source[0] == host:
        country, reason = 'GT', 'dominio_nacional_verificado'
    elif GENERIC_GT.get(normalize(row.get('sitio_fuente'))) == host and source[0] == host:
        country, reason = 'GT', 'tienda_origen_y_moneda_concordantes'
    else:
        return review('origen_no_verificado')
    currencies = {price_currency(row.get(key)) for key in ('precio_regular', 'precio_oferta')}
    currencies.discard(None)
    if currencies and currencies != {MONEY[country]}:
        return review('moneda_ausente_o_conflictiva')
    if reason == 'tienda_origen_y_moneda_concordantes' and not currencies:
        return review('fuente_generica_sin_moneda')
    if not parts:
        return review('url_producto_sin_ruta')
    return Classification('asignado', country, reason)
