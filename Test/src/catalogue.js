// Placeholder catalogue. 24 products, 3 per category, prices in Canadian dollars.
// going is the median of a comparable set; low and high are that set's extremes.
// The three sellers: 1 products (rice-noodle-bowl, trail-mix, laundry-pods) keep the
// thin path reachable, where the single sample makes low, going and high equal.

export const CATEGORIES = [
  'noodles', 'cereal', 'drink', 'snack', 'dairy', 'produce', 'household', 'electronics',
]

export const CATALOGUE = [
  // noodles
  { id: 'instant-noodle-cup', name: 'Instant Noodle Cup', size: '65 g', category: 'noodles', going: 0.99, low: 0.79, high: 1.29, sellers: 5 },
  { id: 'ramen-brick-pack', name: 'Ramen Brick Pack', size: 'pack of 3', category: 'noodles', going: 2.99, low: 2.49, high: 3.49, sellers: 4 },
  { id: 'rice-noodle-bowl', name: 'Rice Noodle Bowl', size: '300 g', category: 'noodles', going: 3.49, low: 3.49, high: 3.49, sellers: 1 },

  // cereal
  { id: 'corn-flake-cereal', name: 'Corn Flake Cereal', size: '425 g', category: 'cereal', going: 4.49, low: 3.99, high: 4.99, sellers: 5 },
  { id: 'oat-ring-cereal', name: 'Oat Ring Cereal', size: '310 g', category: 'cereal', going: 4.79, low: 4.29, high: 5.49, sellers: 4 },
  { id: 'bran-flake-cereal', name: 'Bran Flake Cereal', size: '500 g', category: 'cereal', going: 4.99, low: 4.49, high: 5.99, sellers: 3 },

  // drink
  { id: 'cola-can-pack', name: 'Cola Can Pack', size: 'pack of 12', category: 'drink', going: 6.99, low: 5.99, high: 7.99, sellers: 6 },
  { id: 'orange-juice', name: 'Orange Juice', size: '1.75 L', category: 'drink', going: 4.99, low: 4.49, high: 5.99, sellers: 5 },
  { id: 'sparkling-water', name: 'Sparkling Water', size: 'pack of 6', category: 'drink', going: 4.49, low: 3.99, high: 4.99, sellers: 4 },

  // snack
  { id: 'potato-chips', name: 'Potato Chips', size: '235 g', category: 'snack', going: 3.49, low: 2.99, high: 3.99, sellers: 6 },
  { id: 'chocolate-bar-pack', name: 'Chocolate Bar Pack', size: 'pack of 6', category: 'snack', going: 6.29, low: 5.49, high: 6.99, sellers: 5 },
  { id: 'trail-mix', name: 'Trail Mix', size: '400 g', category: 'snack', going: 5.99, low: 5.99, high: 5.99, sellers: 1 },

  // dairy
  { id: 'whole-milk', name: 'Whole Milk', size: '2 L', category: 'dairy', going: 4.69, low: 4.29, high: 5.29, sellers: 6 },
  { id: 'cheddar-block', name: 'Cheddar Block', size: '400 g', category: 'dairy', going: 6.29, low: 5.49, high: 6.99, sellers: 4 },
  { id: 'greek-yogurt-tub', name: 'Greek Yogurt Tub', size: '750 g', category: 'dairy', going: 6.49, low: 5.99, high: 7.49, sellers: 3 },

  // produce
  { id: 'bananas', name: 'Bananas', size: '1 kg', category: 'produce', going: 1.69, low: 1.49, high: 1.99, sellers: 6 },
  { id: 'avocado-pack', name: 'Avocado Pack', size: 'pack of 3', category: 'produce', going: 3.99, low: 3.49, high: 4.99, sellers: 5 },
  { id: 'baby-carrots', name: 'Baby Carrots', size: '900 g', category: 'produce', going: 2.79, low: 2.49, high: 3.29, sellers: 4 },

  // household
  { id: 'paper-towel-pack', name: 'Paper Towel Pack', size: 'pack of 6', category: 'household', going: 9.99, low: 8.99, high: 11.99, sellers: 5 },
  { id: 'dish-soap', name: 'Dish Soap', size: '739 mL', category: 'household', going: 3.99, low: 3.49, high: 4.49, sellers: 4 },
  { id: 'laundry-pods', name: 'Laundry Pods', size: 'pack of 42', category: 'household', going: 12.99, low: 12.99, high: 12.99, sellers: 1 },

  // electronics
  { id: 'usb-c-cable', name: 'USB-C Cable', size: '2 m', category: 'electronics', going: 10.99, low: 8.99, high: 13.99, sellers: 5 },
  { id: 'wireless-mouse', name: 'Wireless Mouse', size: '1 unit', category: 'electronics', going: 17.99, low: 14.99, high: 21.99, sellers: 4 },
  { id: 'phone-charger-block', name: 'Phone Charger Block', size: '1 unit', category: 'electronics', going: 11.99, low: 9.99, high: 14.49, sellers: 4 },
]

// Look up one product by id, or null.
export function match(id) {
  return CATALOGUE.find((p) => p.id === id) || null
}

// The good/fair/high call. Pure arithmetic, nothing else decides.
export function verdict(asking, product) {
  const { going, low, high, sellers } = product
  const pct = (asking - going) / going

  let tier
  if (pct <= -0.05) tier = 'good'
  else if (pct >= 0.05) tier = 'walk'
  else tier = 'fair'

  const thin = sellers < 2
  const delighted = pct <= -0.25 && asking <= low && sellers >= 2
  const angry = pct >= 0.40 && asking > high && sellers >= 2

  let state = tier
  if (delighted) state = 'delighted'
  else if (angry) state = 'angry'

  return { state, tier, pct, thin }
}

// '$1.47', always two decimals.
export function formatPrice(n) {
  return `$${n.toFixed(2)}`
}
