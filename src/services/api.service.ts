import axios from "axios";
import {
  GenderizeResponse,
  AgifyResponse,
  NationalizeResponse,
} from "../types";

class ApiService {
  private readonly genderizeUrl = "https://api.genderize.io";
  private readonly agifyUrl = "https://api.agify.io";
  private readonly nationalizeUrl = "https://api.nationalize.io";

  async getGenderizeData(name: string): Promise<GenderizeResponse> {
    try {
      const response = await axios.get<GenderizeResponse>(
        `${this.genderizeUrl}`,
        {
          params: { name },
          timeout: 10000,
        },
      );

      if (
        !response.data ||
        response.data.gender === null ||
        response.data.count === 0
      ) {
        throw new Error("Genderize returned an invalid response");
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error("Genderize returned an invalid response");
      }
      throw error;
    }
  }

  async getAgifyData(name: string): Promise<AgifyResponse> {
    try {
      const response = await axios.get<AgifyResponse>(`${this.agifyUrl}`, {
        params: { name },
        timeout: 10000,
      });

      if (!response.data || response.data.age === null) {
        throw new Error("Agify returned an invalid response");
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error("Agify returned an invalid response");
      }
      throw error;
    }
  }

  async getNationalizeData(name: string): Promise<NationalizeResponse> {
    try {
      const response = await axios.get<NationalizeResponse>(
        `${this.nationalizeUrl}`,
        {
          params: { name },
          timeout: 10000,
        },
      );

      if (
        !response.data ||
        !response.data.country ||
        response.data.country.length === 0
      ) {
        throw new Error("Nationalize returned an invalid response");
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error("Nationalize returned an invalid response");
      }
      throw error;
    }
  }

  async enrichProfile(name: string): Promise<{
    gender: string;
    genderProbability: number;
    sampleSize: number;
    age: number;
    countryId: string;
    countryProbability: number;
  }> {
    try {
      const [genderizeData, agifyData, nationalizeData] = await Promise.all([
        this.getGenderizeData(name),
        this.getAgifyData(name),
        this.getNationalizeData(name),
      ]);

      const topCountry = nationalizeData.country.reduce((max, country) =>
        country.probability > max.probability ? country : max,
      );

      return {
        gender: genderizeData.gender!,
        genderProbability: genderizeData.probability,
        sampleSize: genderizeData.count,
        age: agifyData.age!,
        countryId: topCountry.country_id,
        countryProbability: topCountry.probability,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Genderize")) {
          throw new Error("Genderize returned an invalid response");
        } else if (error.message.includes("Agify")) {
          throw new Error("Agify returned an invalid response");
        } else if (error.message.includes("Nationalize")) {
          throw new Error("Nationalize returned an invalid response");
        }
      }
      throw new Error("Failed to enrich profile");
    }
  }
}

export const apiService = new ApiService();
