// @ts-nocheck -- legacy pages ported from the original project
import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Loader2 } from "lucide-react";

interface User {
  address: string;
  role: string;
  connectedAt: string;
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is logged in
    const userData = localStorage.getItem('agritrace-user');
    if (!userData) {
      navigate('/login');
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    
    // Route to appropriate dashboard based on role
    setTimeout(() => {
      switch (parsedUser.role) {
        case 'farmer':
          navigate('/dashboard/farmer');
          break;
        case 'distributor':
          navigate('/dashboard/distributor');
          break;
        case 'retailer':
          navigate('/dashboard/retailer');
          break;
        case 'consumer':
          navigate('/dashboard/consumer');
          break;
        default:
          setLoading(false);
      }
    }, 500);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting to your dashboard...</p>
      </div>
    </div>
  );
};

export default Dashboard;