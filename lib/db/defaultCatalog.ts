export const DEFAULT_CATEGORY_CATALOG: Array<{
  name: string;
  subcategories: string[];
}> = [
  {
    name: 'Labour',
    subcategories: [
      'Steel work',
      'Shuttering',
      'Brick work',
      'Concrete work',
      'Plastering',
      'Electric work',
      'Plumbing',
      'Tile work',
      'Wood work',
      'Paint work',
    ],
  },
  {
    name: 'Materials',
    subcategories: [
      'Cement',
      'M sand',
      'P sand',
      'Metal',
      'Steel',
      'Red Brick',
      'Cement Block 6in',
      'Cement Block 4in',
    ],
  },
  {
    name: 'Machinery/Equipment',
    subcategories: [
      'Excavator',
      'Concrete Mixer',
      'Crane',
      'Vibrator',
      'Generator',
    ],
  },
  {
    name: 'Expenses',
    subcategories: [
      'Transport',
      'Food',
      'Misc',
    ],
  },
];
