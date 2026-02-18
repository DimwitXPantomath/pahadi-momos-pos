import { QRCodeCanvas } from "qrcode.react";


interface QRCodeModalProps {
  orderId: string;
  total: number;
  onClose: () => void;
}

const QRCodeModal = ({ orderId, total, onClose }: QRCodeModalProps) => {
  const orderUrl = `http://192.168.1.5:5173/order/${orderId}`;


  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-80">
        <h2 className="text-xl font-bold mb-2">Bill Generated</h2>

        <p className="text-sm text-gray-600 mb-2">
          Order ID: <strong>{orderId}</strong>
        </p>

        <p className="text-lg font-semibold mb-4">
          Total: ₹{total.toFixed(2)}
        </p>

        <div className="flex justify-center mb-4">
          <QRCodeCanvas value={orderUrl} size={180} />
        </div>

        <p className="text-center text-sm text-gray-500 mb-4">
          Scan to track order
        </p>

        <button
          onClick={onClose}
          className="w-full bg-blue-600 text-white py-2 rounded-lg"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default QRCodeModal;
