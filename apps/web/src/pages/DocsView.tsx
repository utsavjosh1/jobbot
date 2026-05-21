import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function DocsView() {
  return (
    <div className="min-h-screen bg-white">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center text-gray-600 hover:text-black transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to App
        </Link>
        <h1 className="text-xl font-bold text-gray-900">
          Postly Documentation
        </h1>
      </div>
      <div className="max-w-5xl mx-auto py-8">
        <SwaggerUI url="/swagger.json" />
      </div>
    </div>
  );
}
