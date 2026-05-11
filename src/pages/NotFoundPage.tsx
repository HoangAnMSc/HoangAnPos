import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-grain p-4 text-coal">
      <Card className="max-w-lg text-center">
        <p className="font-display text-7xl font-bold text-clay">404</p>
        <h1 className="mt-3 font-display text-3xl font-bold">Không tìm thấy trang</h1>
        <p className="mt-3 text-sm leading-6 text-coal/65">
          Đường dẫn này chưa có trong trang quản trị bán hàng.
        </p>
        <Link to="/pos">
          <Button className="mt-6">Quay về POS</Button>
        </Link>
      </Card>
    </main>
  );
}
