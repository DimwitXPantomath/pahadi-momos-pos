import { MenuItem } from "@/types/menu";


type Props = {
  menu: MenuItem[];
  onAdd: (item: MenuItem) => void;
};

const Menu = ({ menu, onAdd }: Props) => {
  return (
    <div>
      <h2>Menu</h2>

      {menu.map((item) => (
        <div key={item.id}>
          {item.name} - ₹{item.price}
          <button onClick={() => onAdd(item)}>Add</button>
        </div>
      ))}
    </div>
  );
};

export default Menu;
