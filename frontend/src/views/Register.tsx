import { Package } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardLayout from "@/components/DashboardLayout";
import { NewBatchForm } from "@/components/chain/NewBatchForm";
import { WalletGate } from "@/components/chain/WalletGate";

const Register = () => {
  const navigate = useNavigate();
  return (
    <DashboardLayout title="Register Batch">
      <div className="mx-auto max-w-2xl">
        <WalletGate>
          <Card className="card-modern">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Register a new batch
              </CardTitle>
              <CardDescription>
                Your harvest is recorded on the blockchain. The batch id is created automatically and the details cannot be changed later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NewBatchForm onCreated={() => navigate("/dashboard/farmer")} />
            </CardContent>
          </Card>
        </WalletGate>
      </div>
    </DashboardLayout>
  );
};

export default Register;
